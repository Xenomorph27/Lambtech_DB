"""Counts and sums for the Overview screen."""

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

import schemas as s
from database import get_db

router = APIRouter(prefix="/stats", tags=["Stats"])

OVERVIEW_SQL = text(
    """
    select
      (select count(*) from companies)                                             as companies,
      (select count(*) from contacts)                                              as contacts,
      (select count(*) from emails_sent)                                           as emails_sent,
      (select count(*) from emails_sent where status = 'bounced')                  as emails_bounced,
      (select count(*) from responses where category = 'unclassified')             as responses_unclassified,
      (select count(*) from responses_a)                                           as responses_a,
      (select count(*) from responses_b)                                           as responses_b,
      (select count(*) from leads)                                                 as leads_total,
      (select count(*) from leads where status not in ('won', 'lost'))             as leads_open,
      (select count(*) from leads where priority = 'hot'
                                    and status not in ('won', 'lost'))             as leads_hot,
      (select count(*) from transactions where status = 'active')                  as transactions_active,
      (select count(*) from transactions_view where is_overdue)                    as transactions_overdue,
      (select coalesce(sum(total_amount), 0) from transactions
        where status <> 'cancelled')                                               as amount_total,
      (select coalesce(sum(amount_paid), 0) from transactions_view
        where status <> 'cancelled')                                               as amount_paid,
      (select coalesce(sum(amount_remaining), 0) from transactions_view
        where status <> 'cancelled')                                               as amount_remaining,
      (select count(*) from suppressions)                                          as suppressions
    """
)


@router.get("/overview", response_model=s.Overview)
def overview(db: Session = Depends(get_db)):
    return dict(db.execute(OVERVIEW_SQL).first()._mapping)
