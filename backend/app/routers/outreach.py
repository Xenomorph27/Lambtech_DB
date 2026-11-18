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
