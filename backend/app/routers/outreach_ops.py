"""The engine's controls and health, as the desk sees them (spec §6 Mailboxes)."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

import schemas as s
from auth import require_staff
from database import get_db

router = APIRouter(prefix="/outreach", tags=["Outreach engine"])

STATE_SQL = text(
    """
    select st.paused, st.paused_reason, st.paused_at, st.sending_enabled, st.last_cycle_at,
           st.last_inbox_check_at, st.inbox_status, st.inbox_detail, st.engine_version,
           (select count(*) from outreach.messages where status = 'approved')     as queued,
           (select count(*) from outreach.messages where status = 'needs_review') as needs_review
      from outreach.engine_state st
    """
)
MAILBOX_COLUMNS = "email::text as email, daily_cap, is_active, sent_today, counter_date, configured"
REVIEW_SQL = text(
    """
    select m.id, m.step, m.status, m.error, m.subject, m.updated_at,
           ct.email::text as email, ct.full_name, c.name as campaign
      from outreach.messages m
      join outreach.recipients r on r.id = m.recipient_id
      join outreach.campaigns c on c.id = r.campaign_id
      join contacts ct on ct.id = r.contact_id
     where m.status in ('needs_review', 'failed')
     order by m.updated_at desc
     limit 200
    """
)


def _state(db: Session) -> dict:
    return dict(db.execute(STATE_SQL).first()._mapping)


@router.get("/state", response_model=s.EngineState)
def get_state(db: Session = Depends(get_db)):
    return _state(db)


@router.patch("/state", response_model=s.EngineState)
def set_state(body: s.EngineStateUpdate, db: Session = Depends(get_db), staff: dict = Depends(require_staff)):
    who = staff.get("email") or "staff"
    db.execute(
        text(
            "update outreach.engine_state set paused = :p, "
            "paused_reason = case when :p then coalesce(:r, 'Paused by ' || :who) else null end, "
            "paused_at = case when :p then now() else null end"
        ),
        {"p": body.paused, "r": body.reason, "who": who},
    )
    db.execute(
        text("insert into outreach.events (kind, detail) values (:k, :d)"),
        {"k": "pause" if body.paused else "unpause",
         "d": f"{'Paused' if body.paused else 'Unpaused'} by {who}" + (f": {body.reason}" if body.reason else "")},
    )
    db.commit()
    return _state(db)


@router.get("/mailboxes", response_model=list[s.MailboxRead])
def list_mailboxes(db: Session = Depends(get_db)):
    return [dict(r._mapping) for r in db.execute(text(f"select {MAILBOX_COLUMNS} from outreach.mailboxes order by email"))]


@router.patch("/mailboxes/{email}", response_model=s.MailboxRead)
def update_mailbox(email: str, body: s.MailboxUpdate, db: Session = Depends(get_db)):
    row = db.execute(
        text(
            "update outreach.mailboxes set daily_cap = coalesce(:cap, daily_cap), "
            f"is_active = coalesce(:active, is_active) where email = :email returning {MAILBOX_COLUMNS}"
        ),
        {"cap": body.daily_cap, "active": body.is_active, "email": email},
    ).first()
    if row is None:
        db.rollback()
        raise HTTPException(status_code=404, detail="Mailbox not found.")
    db.commit()
    return dict(row._mapping)


@router.get("/events", response_model=list[s.EventRead])
def list_events(limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db)):
    return [
        dict(r._mapping)
        for r in db.execute(
            text("select id, created_at, kind, detail from outreach.events order by id desc limit :n"), {"n": limit}
        )
    ]


@router.get("/review", response_model=list[s.ReviewItem])
def list_review(db: Session = Depends(get_db)):
    return [dict(r._mapping) for r in db.execute(REVIEW_SQL)]


@router.post("/messages/{message_id}/resolve", response_model=s.MessageRead)
def resolve_message(message_id: UUID, body: s.ResolveAction, db: Session = Depends(get_db)):
    current = db.execute(
        text(
            "select m.status, m.email_sent_id, r.status as recipient_status from outreach.messages m "
            "join outreach.recipients r on r.id = m.recipient_id where m.id = :id"
        ),
        {"id": message_id},
    ).first()
    if current is None:
        raise HTTPException(status_code=404, detail="Message not found.")
    if current.status not in ("needs_review", "failed"):
        raise HTTPException(status_code=409, detail="Only stuck or failed messages can be resolved.")
    if body.action == "retry" and current.recipient_status != "active":
        raise HTTPException(status_code=409, detail="This person's sequence has stopped, so it cannot be retried.")
    if current.email_sent_id is not None:
        db.execute(
            text("update emails_sent set status = 'failed' where id = :id and status = 'queued'"),
            {"id": current.email_sent_id},
        )
    row = db.execute(
        text(
            "update outreach.messages set "
            "status = case when :a = 'retry' then 'approved'::outreach.message_status "
            "else 'skipped'::outreach.message_status end, "
            "email_sent_id = null, due_at = case when :a = 'retry' then now() else due_at end, "
            "error = case when :a = 'retry' then null else 'Skipped by staff' end "
            "where id = :id returning id, step, status, subject, body, due_at, error, email_sent_id"
        ),
        {"a": body.action, "id": message_id},
    ).first()
    db.commit()
    return dict(row._mapping)


@router.get("/sent-origins", response_model=list[s.SentOrigin])
def sent_origins(db: Session = Depends(get_db)):
    return [
        dict(r._mapping)
        for r in db.execute(
            text(
                "select m.email_sent_id, c.name as campaign, m.step from outreach.messages m "
                "join outreach.recipients r on r.id = m.recipient_id "
                "join outreach.campaigns c on c.id = r.campaign_id "
                "where m.email_sent_id is not null order by m.updated_at desc limit 5000"
            )
        )
    ]
