"""
Request and response shapes.

Create models say what a POST needs; Update models make every field optional
(a PATCH sends only what changed, and an explicit null clears a field); Read
models are what comes back. Enum values are Literals so a typo is a 422
before it reaches the database. Money is a float in JSON.
"""

from datetime import date, datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

ContactSource = Literal["inbound_form", "apollo", "linkedin", "referral", "event", "import", "manual", "other"]
EmailKind = Literal["outreach", "follow_up", "transactional"]
EmailStatus = Literal["queued", "sent", "delivered", "bounced", "failed"]
ResponseChannel = Literal["email_reply", "inbound_form", "phone", "whatsapp", "other"]
ResponseCategory = Literal["unclassified", "auto_reply", "negative", "unsubscribe", "positive"]
LeadPriority = Literal["hot", "warm", "cold"]
LeadStatus = Literal["new", "contacted", "qualified", "proposal", "won", "lost"]
TransactionStatus = Literal["active", "on_hold", "completed", "cancelled"]
PaymentMethod = Literal["bank_transfer", "upi", "card", "cash", "other"]
SuppressionReason = Literal["unsubscribed", "bounced", "complained", "manual", "erased"]


class _Read(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    created_at: datetime


class _ReadUpdated(_Read):
    updated_at: datetime


# --- companies ---------------------------------------------------------------


class CompanyCreate(BaseModel):
    name: str = Field(min_length=1)
    domain: Optional[str] = None
    industry: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = "India"
    website: Optional[str] = None
    notes: Optional[str] = None


class CompanyUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    domain: Optional[str] = None
    industry: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    website: Optional[str] = None
    notes: Optional[str] = None


class CompanyRead(_ReadUpdated):
    name: str
    domain: Optional[str]
    industry: Optional[str]
    city: Optional[str]
    country: Optional[str]
    website: Optional[str]
    notes: Optional[str]


# --- contacts ----------------------------------------------------------------


class ContactCreate(BaseModel):
    company_id: Optional[UUID] = None
    full_name: str = Field(min_length=1)
    email: str = Field(min_length=3)
    secondary_email: Optional[str] = None
    phone: Optional[str] = None
    secondary_phone: Optional[str] = None
    job_title: Optional[str] = None
    source: ContactSource
    source_detail: Optional[str] = None
    previous_contact_id: Optional[UUID] = None
    notes: Optional[str] = None


class ContactUpdate(BaseModel):
    company_id: Optional[UUID] = None
    full_name: Optional[str] = Field(default=None, min_length=1)
    email: Optional[str] = Field(default=None, min_length=3)
    secondary_email: Optional[str] = None
    phone: Optional[str] = None
    secondary_phone: Optional[str] = None
    job_title: Optional[str] = None
    source: Optional[ContactSource] = None
    source_detail: Optional[str] = None
    previous_contact_id: Optional[UUID] = None
    notes: Optional[str] = None


class ContactRead(_ReadUpdated):
    company_id: Optional[UUID]
    full_name: str
    email: str
    secondary_email: Optional[str]
    phone: Optional[str]
    secondary_phone: Optional[str]
    job_title: Optional[str]
    source: str
    source_detail: Optional[str]
    previous_contact_id: Optional[UUID]
    is_anonymized: bool
    notes: Optional[str]


# --- emails_sent -------------------------------------------------------------


class EmailSentCreate(BaseModel):
    contact_id: UUID
    to_email: Optional[str] = None  # filled from the contact when left out
    from_email: str = Field(min_length=3)
    kind: EmailKind
    subject: str = Field(min_length=1)
    body_text: Optional[str] = None
    provider: Optional[str] = None
    provider_message_id: Optional[str] = None
    thread_id: Optional[str] = None
    status: EmailStatus = "sent"
    sent_at: Optional[datetime] = None


class EmailSentUpdate(BaseModel):
    subject: Optional[str] = Field(default=None, min_length=1)
    body_text: Optional[str] = None
    provider: Optional[str] = None
    provider_message_id: Optional[str] = None
    thread_id: Optional[str] = None
    status: Optional[EmailStatus] = None
    sent_at: Optional[datetime] = None


class EmailSentRead(_ReadUpdated):
    contact_id: UUID
    to_email: str
    from_email: str
    kind: str
    subject: str
    body_text: Optional[str]
    provider: Optional[str]
    provider_message_id: Optional[str]
    thread_id: Optional[str]
    status: str
    sent_at: Optional[datetime]
    bounced_at: Optional[datetime]


# --- responses ---------------------------------------------------------------


class ResponseCreate(BaseModel):
    contact_id: Optional[UUID] = None  # filled from the email when left out
    email_sent_id: Optional[UUID] = None
    channel: ResponseChannel = "email_reply"
    received_at: Optional[datetime] = None
    from_email: Optional[str] = None
    subject: Optional[str] = None
    body_text: Optional[str] = None
    category: ResponseCategory = "unclassified"
    classified_by: Optional[str] = None
    provider_message_id: Optional[str] = None


class ResponseUpdate(BaseModel):
    channel: Optional[ResponseChannel] = None
    received_at: Optional[datetime] = None
    from_email: Optional[str] = None
    subject: Optional[str] = None
    body_text: Optional[str] = None
    category: Optional[ResponseCategory] = None
    classified_by: Optional[str] = None


class ResponseRead(_ReadUpdated):
    contact_id: UUID
    email_sent_id: Optional[UUID]
    channel: str
    received_at: datetime
    from_email: Optional[str]
    subject: Optional[str]
    body_text: Optional[str]
    category: str
    classified_by: Optional[str]
    classified_at: Optional[datetime]
    provider_message_id: Optional[str]


# --- leads -------------------------------------------------------------------


class LeadCreate(BaseModel):
    contact_id: UUID
    response_id: Optional[UUID] = None
    priority: LeadPriority = "warm"
    status: LeadStatus = "new"
    description: Optional[str] = None


class LeadUpdate(BaseModel):
    priority: Optional[LeadPriority] = None
    status: Optional[LeadStatus] = None
    description: Optional[str] = None


class LeadRead(_ReadUpdated):
    serial_no: str
    contact_id: UUID
    response_id: Optional[UUID]
    enquiry_id: Optional[UUID]
    priority: str
    status: str
    description: Optional[str]
    # from leads_view
    full_name: str
    email: str
    phone: Optional[str]
    company_id: Optional[UUID]
    company_name: Optional[str]


# --- transactions ------------------------------------------------------------


class TransactionCreate(BaseModel):
    lead_id: UUID
    company_id: Optional[UUID] = None
    primary_contact_id: Optional[UUID] = None  # defaults to the lead's contact
    title: str = Field(min_length=1)
    scope: Optional[str] = None
    start_date: Optional[date] = None
    deadline: Optional[date] = None
    total_amount: float = Field(ge=0)
    currency: str = Field(default="INR", min_length=3, max_length=3)
    status: TransactionStatus = "active"


class TransactionUpdate(BaseModel):
    company_id: Optional[UUID] = None
    primary_contact_id: Optional[UUID] = None
    title: Optional[str] = Field(default=None, min_length=1)
    scope: Optional[str] = None
    start_date: Optional[date] = None
    deadline: Optional[date] = None
    total_amount: Optional[float] = Field(default=None, ge=0)
    currency: Optional[str] = Field(default=None, min_length=3, max_length=3)
    status: Optional[TransactionStatus] = None


class TransactionRead(_ReadUpdated):
    lead_id: UUID
    company_id: Optional[UUID]
    primary_contact_id: Optional[UUID]
    title: str
    scope: Optional[str]
    start_date: Optional[date]
    deadline: Optional[date]
    total_amount: float
    currency: str
    status: str
    # from transactions_view
    amount_paid: float
    amount_remaining: float
    milestones_done: int
    milestones_total: int
    progress_pct: int
    days_left: Optional[int]
    is_overdue: bool


# --- milestones --------------------------------------------------------------


class MilestoneCreate(BaseModel):
    transaction_id: UUID
    title: str = Field(min_length=1)
    position: int = 1
    due_date: Optional[date] = None
    is_done: bool = False


class MilestoneUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1)
    position: Optional[int] = None
    due_date: Optional[date] = None
    is_done: Optional[bool] = None


class MilestoneRead(_ReadUpdated):
    transaction_id: UUID
    title: str
    position: int
    due_date: Optional[date]
    is_done: bool
    done_at: Optional[datetime]


# --- payments ----------------------------------------------------------------


class PaymentCreate(BaseModel):
    transaction_id: UUID
    amount: float = Field(gt=0)
    paid_on: Optional[date] = None
    method: Optional[PaymentMethod] = None
    reference: Optional[str] = None
    notes: Optional[str] = None


class PaymentUpdate(BaseModel):
    amount: Optional[float] = Field(default=None, gt=0)
    paid_on: Optional[date] = None
    method: Optional[PaymentMethod] = None
    reference: Optional[str] = None
    notes: Optional[str] = None


class PaymentRead(_ReadUpdated):
    transaction_id: UUID
    amount: float
    paid_on: date
    method: Optional[str]
    reference: Optional[str]
    notes: Optional[str]


# --- suppressions ------------------------------------------------------------


class SuppressionCreate(BaseModel):
    email: str = Field(min_length=3)
    reason: SuppressionReason = "manual"
    source: Optional[str] = "manual"


class SuppressionRead(_Read):
    email: str
    reason: str
    source: Optional[str]


# --- enquiries ---------------------------------------------------------------

EnquiryStatus = Literal["new", "contacted", "confirmed", "rejected", "spam"]
# "confirmed" is reached only through the confirm action, which creates the lead.
EnquiryOpenStatus = Literal["new", "contacted", "rejected", "spam"]


class EnquiryUpdate(BaseModel):
    status: Optional[EnquiryOpenStatus] = None
    notes: Optional[str] = None


class EnquiryConfirm(BaseModel):
    full_name: str = Field(min_length=1)
    email: str = Field(min_length=3)
    phone: str = Field(min_length=5)
    company_id: Optional[UUID] = None
    job_title: Optional[str] = None
    priority: LeadPriority = "warm"
    description: Optional[str] = None


class EnquiryRead(_ReadUpdated):
    name: str
    email: str
    phone: str
    topic: Optional[str]
    page: Optional[str]
    meta: dict
    status: str
    notes: Optional[str]
    contact_id: Optional[UUID]
    handled_at: Optional[datetime]


# --- stats -------------------------------------------------------------------


class Overview(BaseModel):
    companies: int
    contacts: int
    emails_sent: int
    emails_bounced: int
    responses_unclassified: int
    responses_a: int
    responses_b: int
    leads_total: int
    leads_open: int
    leads_hot: int
    transactions_active: int
    transactions_overdue: int
    amount_total: float
    amount_paid: float
    amount_remaining: float
    suppressions: int
    enquiries_new: int
