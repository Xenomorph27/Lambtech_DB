"""
The tables and views, as SQLAlchemy Core definitions.

These mirror supabase/migrations; the database is the source of truth and
owns every rule (defaults, serials, triggers, delete rules), so the API only
needs the column names and types to read and write rows. Enum and citext
columns are plain strings here: Postgres casts on the way in and the API
validates values with Pydantic before they get that far.
"""

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Integer,
    JSON,
    MetaData,
    Numeric,
    String,
    Table,
    Text,
    Uuid,
    text,
)

metadata = MetaData()


def _base(*extra, updated=True):
    cols = [
        Column("id", Uuid, primary_key=True, server_default=text("gen_random_uuid()")),
        Column("created_at", DateTime(timezone=True)),
    ]
    if updated:
        cols.append(Column("updated_at", DateTime(timezone=True)))
    return cols + list(extra)


companies = Table(
    "companies",
    metadata,
    *_base(
        Column("name", Text),
        Column("domain", String),
        Column("industry", Text),
        Column("city", Text),
        Column("country", Text),
        Column("website", Text),
        Column("notes", Text),
    ),
)

contacts = Table(
    "contacts",
    metadata,
    *_base(
        Column("company_id", Uuid),
        Column("full_name", Text),
        Column("email", String),
        Column("secondary_email", String),
        Column("phone", Text),
        Column("secondary_phone", Text),
        Column("job_title", Text),
        Column("source", String),
        Column("source_detail", Text),
        Column("previous_contact_id", Uuid),
        Column("is_anonymized", Boolean),
        Column("notes", Text),
    ),
)

emails_sent = Table(
    "emails_sent",
    metadata,
    *_base(
        Column("contact_id", Uuid),
        Column("to_email", String),
        Column("from_email", String),
        Column("kind", String),
        Column("subject", Text),
        Column("body_text", Text),
        Column("provider", Text),
        Column("provider_message_id", Text),
        Column("thread_id", Text),
        Column("status", String),
        Column("sent_at", DateTime(timezone=True)),
        Column("bounced_at", DateTime(timezone=True)),
    ),
)

responses = Table(
    "responses",
    metadata,
    *_base(
        Column("contact_id", Uuid),
        Column("email_sent_id", Uuid),
        Column("channel", String),
        Column("received_at", DateTime(timezone=True)),
        Column("from_email", String),
        Column("subject", Text),
        Column("body_text", Text),
        Column("category", String),
        Column("classified_by", Text),
        Column("classified_at", DateTime(timezone=True)),
        Column("provider_message_id", Text),
    ),
)

_lead_columns = lambda: [  # noqa: E731 - shared by the table and its view
    Column("serial_no", Text),
    Column("contact_id", Uuid),
    Column("response_id", Uuid),
    Column("priority", String),
    Column("status", String),
    Column("description", Text),
    Column("enquiry_id", Uuid),
]

leads = Table("leads", metadata, *_base(*_lead_columns()))

leads_view = Table(
    "leads_view",
    metadata,
    *_base(
        *_lead_columns(),
        Column("full_name", Text),
        Column("email", String),
        Column("phone", Text),
        Column("company_id", Uuid),
        Column("company_name", Text),
    ),
)

_transaction_columns = lambda: [  # noqa: E731
    Column("lead_id", Uuid),
    Column("company_id", Uuid),
    Column("primary_contact_id", Uuid),
    Column("title", Text),
    Column("scope", Text),
    Column("start_date", Date),
    Column("deadline", Date),
    Column("total_amount", Numeric(12, 2)),
    Column("currency", String(3)),
    Column("status", String),
]

transactions = Table("transactions", metadata, *_base(*_transaction_columns()))

transactions_view = Table(
    "transactions_view",
    metadata,
    *_base(
        *_transaction_columns(),
        Column("amount_paid", Numeric(12, 2)),
        Column("amount_remaining", Numeric(12, 2)),
        Column("milestones_done", Integer),
        Column("milestones_total", Integer),
        Column("progress_pct", Integer),
        Column("days_left", Integer),
        Column("is_overdue", Boolean),
    ),
)

milestones = Table(
    "milestones",
    metadata,
    *_base(
        Column("transaction_id", Uuid),
        Column("title", Text),
        Column("position", Integer),
        Column("due_date", Date),
        Column("is_done", Boolean),
        Column("done_at", DateTime(timezone=True)),
    ),
)

payments = Table(
    "payments",
    metadata,
    *_base(
        Column("transaction_id", Uuid),
        Column("amount", Numeric(12, 2)),
        Column("paid_on", Date),
        Column("method", String),
        Column("reference", Text),
        Column("notes", Text),
    ),
)

suppressions = Table(
    "suppressions",
    metadata,
    *_base(
        Column("email", String),
        Column("reason", String),
        Column("source", Text),
        updated=False,
    ),
)

enquiries = Table(
    "enquiries",
    metadata,
    *_base(
        Column("name", Text),
        Column("email", String),
        Column("phone", Text),
        Column("topic", Text),
        Column("page", Text),
        Column("meta", JSON),
        Column("ip_hash", Text),
        Column("status", String),
        Column("notes", Text),
        Column("contact_id", Uuid),
        Column("handled_at", DateTime(timezone=True)),
    ),
)
