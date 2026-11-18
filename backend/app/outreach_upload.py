"""
Creating an outreach campaign from a CSV, in one transaction (spec §4.1, §6).

People who must not be emailed are skipped and counted, never stored as
recipients: suppressed or erased addresses, people already emailed by any
campaign, addresses whose domain does not exist or takes no mail.
"""

import json
from dataclasses import dataclass
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

import outreach_csv as oc


@dataclass
class StepIn:
    step: int
    subject: str
    body: str
    wait_days: int = 3


BLOCKED_SQL = text(
    """
    select 1 from suppressions where email = :email
    union all
    select 1 from contacts where email = :email and is_anonymized
    limit 1
    """
)
CONTACTED_SQL = text(
    """
    select 1 from emails_sent where contact_id = :cid and kind in ('outreach', 'follow_up')
    union all
    select 1 from outreach.recipients where contact_id = :cid and status <> 'pending'
    limit 1
    """
)


def _check(name: str, steps: list) -> str:
    clean = (name or "").strip()
    if not 1 <= len(clean) <= 200:
        raise ValueError("Give the campaign a name (up to 200 characters).")
    numbers = [s.step for s in steps]
    if not steps or len(steps) > 3 or numbers != list(range(1, len(steps) + 1)):
        raise ValueError("Steps must be step 1, optionally followed by steps 2 and 3.")
    for s in steps:
        if not str(s.subject).strip() or not str(s.body).strip():
            raise ValueError(f"Step {s.step} needs a subject and a message.")
        if s.step > 1 and not 1 <= int(s.wait_days) <= 60:
            raise ValueError(f"Step {s.step} must wait between 1 and 60 days.")
    return clean


def _company_id(db: Session, person: oc.Person, domain: str) -> Optional[str]:
    if domain in oc.FREE_MAIL:
        return None
    found = db.execute(text("select id from companies where domain = :d"), {"d": domain}).first()
    if found:
        return found.id
    if not person.company:
        return None
    return db.execute(
        text("insert into companies (name, domain, website, city) values (:n, :d, :w, :c) returning id"),
        {"n": person.company, "d": domain, "w": person.website or None, "c": person.city or None},
    ).scalar_one()


def create_campaign(db: Session, *, name: str, csv_bytes: bytes, steps: list, created_by: Optional[str]) -> dict:
    parsed = oc.parse_csv(csv_bytes)
    clean_name = _check(name, steps)
    report = {"added": 0, "invalid": 0, "duplicates": 0, "already_contacted": 0, "suppressed": 0, "bad_domain": 0}

    people, seen = [], set()
    for row in parsed.rows:
        person = oc.person_from_row(row)
        if person is None:
            report["invalid"] += 1
        elif person.email in seen:
            report["duplicates"] += 1
        else:
            seen.add(person.email)
            people.append(person)
    domain_status = oc.check_domains([p.email.split("@", 1)[1] for p in people])

    campaign_id = db.execute(
        text("insert into outreach.campaigns (name, created_by) values (:n, :b) returning id"),
        {"n": clean_name, "b": created_by},
    ).scalar_one()
    for s in steps:
        db.execute(
            text(
                "insert into outreach.steps (campaign_id, step, subject_template, body_template, wait_days) "
                "values (:c, :s, :subj, :body, :w)"
            ),
            {"c": campaign_id, "s": s.step, "subj": s.subject, "body": s.body, "w": max(1, int(s.wait_days))},
        )

    source = "apollo" if parsed.is_apollo else "import"
    unknown = set()
    for person in people:
        domain = person.email.split("@", 1)[1]
        if domain_status.get(domain) in ("no_domain", "no_mail"):
            report["bad_domain"] += 1
            continue
        if db.execute(BLOCKED_SQL, {"email": person.email}).first():
            report["suppressed"] += 1
            continue
        existing = db.execute(text("select id from contacts where email = :e"), {"e": person.email}).first()
        if existing and db.execute(CONTACTED_SQL, {"cid": existing.id}).first():
            report["already_contacted"] += 1
            continue
        company_id = _company_id(db, person, domain)
        if existing:
            contact_id = existing.id
            db.execute(
                text(
                    "update contacts set job_title = coalesce(job_title, :jt), "
                    "company_id = coalesce(company_id, :co) where id = :id"
                ),
                {"jt": person.job_title or None, "co": company_id, "id": contact_id},
            )
        else:
            contact_id = db.execute(
                text(
                    "insert into contacts (full_name, email, job_title, company_id, source, source_detail) "
                    "values (:n, :e, :jt, :co, cast(:src as contact_source), :sd) returning id"
                ),
                {"n": person.full_name, "e": person.email, "jt": person.job_title or None,
                 "co": company_id, "src": source, "sd": clean_name},
            ).scalar_one()
        recipient_id = db.execute(
            text(
                "insert into outreach.recipients (campaign_id, contact_id, merge) "
                "values (:c, :ct, cast(:m as jsonb)) returning id"
            ),
            {"c": campaign_id, "ct": contact_id, "m": json.dumps(person.merge)},
        ).scalar_one()
        for s in steps:
            subject = oc.render(s.subject, person.merge)
            body = oc.render(s.body, person.merge)
            unknown.update(oc.unresolved(subject + "\n" + body))
            db.execute(
                text("insert into outreach.messages (recipient_id, step, subject, body) values (:r, :s, :subj, :body)"),
                {"r": recipient_id, "s": s.step, "subj": subject, "body": body},
            )
        report["added"] += 1

    db.commit()
    return {"campaign_id": str(campaign_id), **report, "unknown_tags": sorted(unknown)}
