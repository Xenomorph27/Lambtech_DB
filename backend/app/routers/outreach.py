"""Outreach campaigns: upload, list, review drafts, queue, stop (spec §6)."""

import json
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy import text
from sqlalchemy.orm import Session

import outreach_csv as oc
import schemas as s
from auth import require_staff
from database import get_db
from outreach_upload import StepIn, create_campaign

router = APIRouter(prefix="/outreach", tags=["Outreach"])

MAX_UPLOAD_BYTES = 5_000_000


def _read_upload(file: UploadFile) -> bytes:
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="The file is larger than 5 MB.")
    return data


@router.post("/csv-columns", response_model=s.CsvPreview)
def csv_columns(file: UploadFile = File(...)):
    try:
        parsed = oc.parse_csv(_read_upload(file))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return {"columns": parsed.columns, "rows": len(parsed.rows), "is_apollo": parsed.is_apollo}


@router.post("/campaigns", response_model=s.UploadReport, status_code=status.HTTP_201_CREATED)
def upload_campaign(
    name: str = Form(...),
    steps: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    staff: dict = Depends(require_staff),
):
    try:
        step_list = [StepIn(**item) for item in json.loads(steps)]
    except (ValueError, TypeError):
        raise HTTPException(status_code=422, detail="Steps are not in the expected shape.")
    try:
        return create_campaign(
            db, name=name, csv_bytes=_read_upload(file), steps=step_list, created_by=staff.get("email")
        )
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc))


LIST_SQL = text(
    """
    select c.id, c.name, c.created_at, c.created_by,
           count(distinct r.id)                                              as recipients,
           count(m.id) filter (where m.status = 'draft')                     as drafts,
           count(m.id) filter (where m.status = 'approved')                  as queued,
           count(m.id) filter (where m.status = 'sent')                      as sent,
           count(distinct r.id) filter (where r.status = 'replied')          as replied,
           count(m.id) filter (where m.status in ('failed', 'needs_review')) as problems
      from outreach.campaigns c
      left join outreach.recipients r on r.campaign_id = c.id
      left join outreach.messages m on m.recipient_id = r.id
     where c.archived_at is null
     group by c.id
     order by c.created_at desc
    """
)
RECIPIENTS_SQL = text(
    """
    select r.id, r.status, r.stop_reason, r.current_step,
           ct.id as contact_id, ct.full_name, ct.email::text as email,
           coalesce(
             json_agg(json_build_object(
               'id', m.id, 'step', m.step, 'status', m.status, 'subject', m.subject,
               'body', m.body, 'due_at', m.due_at, 'error', m.error, 'email_sent_id', m.email_sent_id
             ) order by m.step) filter (where m.id is not null),
             '[]'::json
           ) as messages
      from outreach.recipients r
      join contacts ct on ct.id = r.contact_id
      left join outreach.messages m on m.recipient_id = r.id
     where r.campaign_id = :cid
     group by r.id, ct.id
     order by ct.full_name, ct.email
     limit 2000
    """
)
UNFILLED_SQL = text(
    r"""
    select count(*) from outreach.messages m
      join outreach.recipients r on r.id = m.recipient_id
     where r.campaign_id = :cid and m.status = 'draft'
       and (m.subject ~ '\{[a-z0-9_]+\}' or m.body ~ '\{[a-z0-9_]+\}')
    """
)
STOP_SUPPRESSED_SQL = text(
    """
    update outreach.recipients r
       set status = 'stopped', stop_reason = 'on the do-not-email list'
      from contacts ct
     where ct.id = r.contact_id and r.campaign_id = :cid and r.status = 'pending'
       and (ct.is_anonymized or exists (select 1 from suppressions s where s.email = ct.email))
    """
)
SKIP_STOPPED_SQL = text(
    """
    update outreach.messages m set status = 'skipped', error = 'Recipient stopped'
      from outreach.recipients r
     where r.id = m.recipient_id and r.campaign_id = :cid and r.status = 'stopped'
       and m.status in ('draft', 'approved')
    """
)
APPROVE_SQL = text(
    """
    update outreach.messages m
       set status = 'approved', due_at = case when m.step = 1 then now() else null end
      from outreach.recipients r
     where r.id = m.recipient_id and r.campaign_id = :cid and r.status = 'active' and m.status = 'draft'
    """
)


def _campaign_or_404(db: Session, campaign_id: UUID):
    row = db.execute(
        text("select id, name, created_at, created_by from outreach.campaigns where id = :id"), {"id": campaign_id}
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Campaign not found.")
    return row


@router.get("/campaigns", response_model=list[s.CampaignSummary])
def list_campaigns(db: Session = Depends(get_db)):
    return [dict(r._mapping) for r in db.execute(LIST_SQL)]


@router.get("/campaigns/{campaign_id}", response_model=s.CampaignDetail)
def get_campaign(campaign_id: UUID, db: Session = Depends(get_db)):
    campaign = dict(_campaign_or_404(db, campaign_id)._mapping)
    campaign["steps"] = [
        dict(r._mapping)
        for r in db.execute(
            text(
                "select step, subject_template, body_template, wait_days from outreach.steps "
                "where campaign_id = :id order by step"
            ),
            {"id": campaign_id},
        )
    ]
    return campaign


@router.get("/campaigns/{campaign_id}/recipients", response_model=list[s.RecipientRead])
def list_recipients(campaign_id: UUID, db: Session = Depends(get_db)):
    _campaign_or_404(db, campaign_id)
    return [dict(r._mapping) for r in db.execute(RECIPIENTS_SQL, {"cid": campaign_id})]


@router.patch("/messages/{message_id}", response_model=s.MessageRead)
def edit_message(message_id: UUID, body: s.MessageUpdate, db: Session = Depends(get_db)):
    row = db.execute(
        text(
            "update outreach.messages set subject = coalesce(:subject, subject), body = coalesce(:body, body) "
            "where id = :id and status in ('draft', 'approved') "
            "returning id, step, status, subject, body, due_at, error, email_sent_id"
        ),
        {"id": message_id, "subject": body.subject, "body": body.body},
    ).first()
    if row is None:
        exists = db.execute(text("select 1 from outreach.messages where id = :id"), {"id": message_id}).first()
        db.rollback()
        if exists is None:
            raise HTTPException(status_code=404, detail="Message not found.")
        raise HTTPException(status_code=409, detail="Only unsent messages can be edited.")
    db.commit()
    return dict(row._mapping)


@router.post("/campaigns/{campaign_id}/queue", response_model=s.QueueResult)
def queue_campaign(campaign_id: UUID, db: Session = Depends(get_db)):
    _campaign_or_404(db, campaign_id)
    unfilled = db.execute(UNFILLED_SQL, {"cid": campaign_id}).scalar_one()
    if unfilled:
        raise HTTPException(
            status_code=422,
            detail=f"{unfilled} message(s) still contain an unfilled {{tag}}. Edit them before queueing.",
        )
    stopped = db.execute(STOP_SUPPRESSED_SQL, {"cid": campaign_id}).rowcount
    db.execute(SKIP_STOPPED_SQL, {"cid": campaign_id})
    queued = db.execute(
        text("update outreach.recipients set status = 'active' where campaign_id = :cid and status = 'pending'"),
        {"cid": campaign_id},
    ).rowcount
    db.execute(APPROVE_SQL, {"cid": campaign_id})
    db.commit()
    return {"queued_recipients": queued, "stopped": stopped}


@router.post("/recipients/{recipient_id}/stop", status_code=status.HTTP_204_NO_CONTENT)
def stop_recipient(recipient_id: UUID, db: Session = Depends(get_db)):
    row = db.execute(
        text(
            "update outreach.recipients set status = 'stopped', stop_reason = 'Stopped by staff' "
            "where id = :id and status in ('pending', 'active') returning id"
        ),
        {"id": recipient_id},
    ).first()
    if row is None:
        exists = db.execute(text("select 1 from outreach.recipients where id = :id"), {"id": recipient_id}).first()
        db.rollback()
        if exists is None:
            raise HTTPException(status_code=404, detail="Recipient not found.")
        raise HTTPException(status_code=409, detail="Only pending or active recipients can be stopped.")
    db.execute(
        text(
            "update outreach.messages set status = 'skipped', error = 'Recipient stopped' "
            "where recipient_id = :id and status in ('draft', 'approved')"
        ),
        {"id": recipient_id},
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/campaigns/{campaign_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_campaign(campaign_id: UUID, db: Session = Depends(get_db)):
    _campaign_or_404(db, campaign_id)
    started = db.execute(
        text(
            "select 1 from outreach.messages m join outreach.recipients r on r.id = m.recipient_id "
            "where r.campaign_id = :cid and m.status in ('sending', 'sent', 'needs_review', 'failed') limit 1"
        ),
        {"cid": campaign_id},
    ).first()
    if started:
        raise HTTPException(
            status_code=409, detail="This campaign has already sent email. Stop its recipients instead."
        )
    db.execute(text("delete from outreach.campaigns where id = :id"), {"id": campaign_id})
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
