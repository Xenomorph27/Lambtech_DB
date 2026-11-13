"""The nine resources of spec §10.2, plus contact erasure."""

from uuid import UUID

from fastapi import Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

import crud
import models as m
import schemas as s
from database import get_db
from routers.base import make_crud_router

companies = make_crud_router("/companies", "Company", m.companies, s.CompanyRead, s.CompanyCreate, s.CompanyUpdate)

contacts = make_crud_router(
    "/contacts", "Contact", m.contacts, s.ContactRead, s.ContactCreate, s.ContactUpdate,
    filters=("company_id", "source"),
)


@contacts.post("/{row_id}/anonymize", response_model=s.ContactRead)
def anonymize_contact(row_id: UUID, db: Session = Depends(get_db)):
    """Erase the person (DPDP request) but keep the rows: name, emails and phones become placeholders."""
    if crud.get_row(db, m.contacts, row_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found.")
    db.execute(text("select anonymize_contact(:id)"), {"id": row_id})
    db.commit()
    return crud.get_row(db, m.contacts, row_id)


emails_sent = make_crud_router(
    "/emails-sent", "Email sent", m.emails_sent, s.EmailSentRead, s.EmailSentCreate, s.EmailSentUpdate,
    filters=("contact_id", "status", "kind"),
)

responses = make_crud_router(
    "/responses", "Response", m.responses, s.ResponseRead, s.ResponseCreate, s.ResponseUpdate,
    filters=("category", "contact_id", "email_sent_id", "channel"),
)

leads = make_crud_router(
    "/leads", "Lead", m.leads, s.LeadRead, s.LeadCreate, s.LeadUpdate,
    filters=("status", "priority", "contact_id", "enquiry_id"),
    read_table=m.leads_view,
)

transactions = make_crud_router(
    "/transactions", "Transaction", m.transactions, s.TransactionRead, s.TransactionCreate, s.TransactionUpdate,
    filters=("status", "lead_id", "company_id"),
    read_table=m.transactions_view,
)

milestones = make_crud_router(
    "/milestones", "Milestone", m.milestones, s.MilestoneRead, s.MilestoneCreate, s.MilestoneUpdate,
    filters=("transaction_id",),
)

payments = make_crud_router(
    "/payments", "Payment", m.payments, s.PaymentRead, s.PaymentCreate, s.PaymentUpdate,
    filters=("transaction_id",),
)

# List, add and remove only: an entry is corrected by deleting and re-adding it.
suppressions = make_crud_router(
    "/suppressions", "Suppression", m.suppressions, s.SuppressionRead, s.SuppressionCreate,
    filters=("reason",),
)

ALL = [companies, contacts, emails_sent, responses, leads, transactions, milestones, payments, suppressions]
