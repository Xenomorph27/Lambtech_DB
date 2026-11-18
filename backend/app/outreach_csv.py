"""
Outreach uploads: reading the CSV, turning rows into people, merge tags, and
the domain check. Pure functions - no database - so they are tested alone.
"""

import csv
import io
import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Callable, Iterable, Optional

import dns.exception
import dns.resolver

MAX_ROWS = 5000
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
TAG_RE = re.compile(r"\{([a-z0-9_]+)\}")
APOLLO_HINTS = {"first name", "last name", "company name for emails", "# employees", "person linkedin url"}
FREE_MAIL = frozenset(
    {
        "gmail.com", "googlemail.com", "yahoo.com", "yahoo.in", "yahoo.co.in", "hotmail.com",
        "outlook.com", "live.com", "icloud.com", "aol.com", "zoho.com", "protonmail.com",
        "proton.me", "mail.com", "yandex.com", "rediffmail.com",
    }
)


def column_tag(header: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (header or "").strip().lower()).strip("_")


@dataclass
class ParsedCsv:
    columns: list
    rows: list
    is_apollo: bool


@dataclass
class Person:
    email: str
    full_name: str
    first_name: str
    last_name: str
    company: str
    job_title: str
    city: str
    website: str
    merge: dict = field(default_factory=dict)


def parse_csv(data: bytes) -> ParsedCsv:
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise ValueError(
            "This file is not UTF-8. In Excel choose Save As > 'CSV UTF-8 (Comma delimited)' and upload it again."
        )
    try:
        reader = csv.DictReader(io.StringIO(text))
        headers = [h for h in (reader.fieldnames or []) if h and h.strip()]
        rows = []
        for raw in reader:
            rows.append(
                {
                    key.strip().lower(): (value.strip() if isinstance(value, str) else "")
                    for key, value in raw.items()
                    if key
                }
            )
            if len(rows) > MAX_ROWS:
                raise ValueError(f"The file has more than {MAX_ROWS} rows. Split it into smaller files.")
    except csv.Error as exc:
        raise ValueError(f"The file is not a readable CSV ({exc}).")
    lower = [h.strip().lower() for h in headers]
    if "email" not in lower:
        raise ValueError("The CSV must have a column named email.")
    columns = [{"name": h.strip(), "tag": column_tag(h)} for h in headers if column_tag(h)]
    return ParsedCsv(columns=columns, rows=rows, is_apollo=bool(APOLLO_HINTS & set(lower)))


def normalise_email(raw: str) -> Optional[str]:
    value = (raw or "").strip().lower()
    if len(value) > 254 or not EMAIL_RE.match(value):
        return None
    return value


def person_from_row(row: dict) -> Optional[Person]:
    email = normalise_email(row.get("email", ""))
    if email is None:
        return None
    domain = email.split("@", 1)[1]
    first = row.get("first name", "")
    last = row.get("last name", "")
    named = row.get("name") or " ".join(part for part in (first, last) if part)
    full_name = named or email.split("@", 1)[0]
    first_name = first or (named.split()[0] if named else "")
    company = row.get("company") or row.get("company name") or row.get("company name for emails") or ""
    job_title = row.get("role") or row.get("title") or ""
    city = row.get("city") or row.get("company city") or ""
    website = row.get("website") or ""
    merge = {
        "name": named,
        "first_name": first_name,
        "last_name": last,
        "company": company,
        "role": job_title,
        "email": email,
        "website": website or domain,
        "city": city,
    }
    for key, value in row.items():
        tag = column_tag(key)
        if tag and tag not in merge:
            merge[tag] = value
    return Person(email, full_name, first_name, last, company, job_title, city, website, merge)


def render(template: str, merge: dict) -> str:
    def fill(match):
        tag = match.group(1)
        return str(merge.get(tag) or "") if tag in merge else match.group(0)

    return TAG_RE.sub(fill, template or "")


def unresolved(text: str) -> list:
    return TAG_RE.findall(text or "")


def mx_status(domain: str) -> str:
    try:
        answers = dns.resolver.resolve(domain, "MX", lifetime=4)
    except dns.resolver.NXDOMAIN:
        return "no_domain"
    except dns.resolver.NoAnswer:
        return "ok"  # no MX record: mail still goes to the address record (RFC 5321 §5.1)
    except (dns.exception.DNSException, OSError):
        return "unknown"
    hosts = [str(record.exchange).rstrip(".") for record in answers]
    return "ok" if any(hosts) else "no_mail"  # a null MX (".") says the domain takes no mail


def check_domains(domains: Iterable[str], lookup: Optional[Callable[[str], str]] = None) -> dict:
    lookup = lookup or mx_status
    unique = sorted(set(domains))
    if not unique:
        return {}
    with ThreadPoolExecutor(max_workers=16) as pool:
        return dict(zip(unique, pool.map(lookup, unique)))
