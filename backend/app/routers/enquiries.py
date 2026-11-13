"""Website enquiries: read, work, and confirm into a lead."""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import text
from sqlalchemy.orm import Session

import crud
import models as m
import schemas as s
from database import get_db

router = APIRouter(prefix="/enquiries", tags=["Enquiry"])

CONFIRM_SQL = text(
    """
    select confirm_enquiry(
      p_enquiry_id  => cast(:enquiry_id as uuid),
      p_full_name   => :full_name,
      p_email       => :email,
      p_phone       => :phone,
      p_company_id  => cast(:company_id as uuid),
      p_job_title   => :job_title,
      p_priority    => cast(:priority as lead_priority),
      p_description => :description
    ) as lead_id
    """
)


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enquiry not found.")


def _read(db: Session, row_id: UUID) -> dict:
    row = crud.get_row(db, m.enquiries, row_id)
    if row is None:
        raise _not_found()
    return row


@router.get("", response_model=list[s.EnquiryRead])
def list_enquiries(
    status_filter: Optional[s.EnquiryStatus] = Query(None, alias="status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    filters = {"status": status_filter} if status_filter else {}
    return crud.list_rows(db, m.enquiries, filters, skip, limit)


@router.get("/{row_id}", response_model=s.EnquiryRead)
def get_enquiry(row_id: UUID, db: Session = Depends(get_db)):
    return _read(db, row_id)


@router.patch("/{row_id}", response_model=s.EnquiryRead)
def update_enquiry(row_id: UUID, body: s.EnquiryUpdate, db: Session = Depends(get_db)):
    row = crud.update_row(db, m.enquiries, row_id, body.model_dump(exclude_unset=True))
    if row is None:
        raise _not_found()
    return row


@router.delete("/{row_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_enquiry(row_id: UUID, db: Session = Depends(get_db)):
    if not crud.delete_row(db, m.enquiries, row_id):
        raise _not_found()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{row_id}/confirm", response_model=s.LeadRead, status_code=status.HTTP_201_CREATED)
def confirm_enquiry(row_id: UUID, body: s.EnquiryConfirm, db: Session = Depends(get_db)):
    """Find or create the contact, create the lead, mark the enquiry confirmed - one transaction."""
    _read(db, row_id)
    params = {
        **body.model_dump(),
        "enquiry_id": str(row_id),
        "company_id": str(body.company_id) if body.company_id else None,
    }
    lead_id = db.execute(CONFIRM_SQL, params).scalar_one()
    db.commit()
    return crud.get_row(db, m.leads_view, lead_id)
