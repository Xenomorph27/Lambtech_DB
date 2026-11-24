"""The Outreach page: one read-only summary of how the engine is doing.

Counts only the engine's own sends (an emails_sent row linked from
outreach.messages) and the replies to them, so hand-sent email never skews
the rates. Nothing here writes.

The send window and bounce limit mirror the engine's defaults
(emailauto-LT engine/config.py); change both together.
"""

from datetime import datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

import schemas as s
from database import get_db
from routers.outreach_ops import _state

router = APIRouter(prefix="/outreach", tags=["Outreach engine"])

TZ_NAME = "Asia/Kolkata"
TZ = timezone(timedelta(hours=5, minutes=30))  # India keeps no daylight saving
WINDOW_START = time(10, 0)
WINDOW_END = time(17, 0)
BOUNCE_PAUSE_PERCENT = 5.0
# The schedule runs every 10 minutes in the window and every 2 hours outside it;
# GitHub can start a run late or skip one, so outside the window allow two gaps.
STALE_IN_WINDOW = timedelta(hours=1)
STALE_OUTSIDE = timedelta(hours=4, minutes=30)
CATEGORIES = ("positive", "unclassified", "negative", "unsubscribe", "auto_reply")

ENGINE_SENDS = (
    "from emails_sent e join outreach.messages m on m.email_sent_id = e.id "
    "where e.status in ('sent', 'delivered', 'bounced') and e.sent_at is not null"
)
ENGINE_REPLIES = (
    "from responses rs join outreach.messages m on m.email_sent_id = rs.email_sent_id "
    "where rs.received_at >= now() - interval '30 days'"
)

KPI_SQL = text(
    f"""
    select
      count(*) filter (where e.sent_at >= now() - interval '30 days')                              as sent_30d,
      count(*) filter (where e.sent_at >= now() - interval '7 days')                               as sent_7d,
      count(*) filter (where (e.sent_at at time zone :tz)::date = (now() at time zone :tz)::date)  as sent_today,
      count(*) filter (where e.status = 'bounced' and e.sent_at >= now() - interval '30 days')     as bounced_30d,
      count(*) filter (where e.status = 'bounced'
                         and (e.sent_at at time zone :tz)::date = (now() at time zone :tz)::date)  as bounced_today,
      count(distinct e.contact_id) filter (where e.sent_at >= now() - interval '30 days')          as people_emailed_30d
    {ENGINE_SENDS}
    """
)
REPLIED_SQL = text(
    f"select count(distinct rs.contact_id) as n {ENGINE_REPLIES} and rs.category <> 'auto_reply'"
)
BY_TYPE_SQL = text(f"select rs.category::text as category, count(*) as n {ENGINE_REPLIES} group by 1")
DAILY_SQL = text(
    f"""
    with days as (
      select generate_series((now() at time zone :tz)::date - 13, (now() at time zone :tz)::date, interval '1 day')::date as day
    ),
    sent as (
      select (e.sent_at at time zone :tz)::date as day, count(*) as n {ENGINE_SENDS} group by 1
    ),
    replies as (
      select (rs.received_at at time zone :tz)::date as day, count(*) as n
        from responses rs join outreach.messages m on m.email_sent_id = rs.email_sent_id
       where rs.category <> 'auto_reply' group by 1
    )
    select d.day, coalesce(s.n, 0) as sent, coalesce(r.n, 0) as replies
      from days d left join sent s on s.day = d.day left join replies r on r.day = d.day
     order by d.day
    """
)
QUEUE_SQL = text(
    """
    select
      count(*) filter (where m.due_at is not null and m.due_at <= now()) as due_now,
      count(*) filter (where m.due_at is null)                           as waiting_follow_ups
      from outreach.messages m join outreach.recipients r on r.id = m.recipient_id
     where m.status = 'approved' and r.status = 'active'
    """
)
UPCOMING_SQL = text(
    """
    select (greatest(m.due_at, now()) at time zone :tz)::date as day, c.name as campaign,
           count(*) as emails, count(*) filter (where m.step > 1) as follow_ups
      from outreach.messages m
      join outreach.recipients r on r.id = m.recipient_id
      join outreach.campaigns c on c.id = r.campaign_id
     where m.status = 'approved' and r.status = 'active' and m.due_at is not null
     group by 1, 2
     order by 1, 2
     limit 14
    """
)
CAP_SQL = text(
    """
    select count(*) as mailboxes,
           coalesce(sum(daily_cap), 0) as cap_today,
           coalesce(sum(greatest(daily_cap - case when counter_date = (now() at time zone :tz)::date
                                                  then sent_today else 0 end, 0)), 0) as cap_left
      from outreach.mailboxes
     where configured and is_active
    """
)


def _next_window(now: datetime) -> datetime:
    here = now.astimezone(TZ)
    day = here.date()
    if here.weekday() < 5 and here.time() < WINDOW_START:
        return datetime.combine(day, WINDOW_START, TZ)
    day += timedelta(days=1)
    while day.weekday() >= 5:
        day += timedelta(days=1)
    return datetime.combine(day, WINDOW_START, TZ)


def _in_window(now: datetime) -> bool:
    here = now.astimezone(TZ)
    return here.weekday() < 5 and WINDOW_START <= here.time() <= WINDOW_END


def _status(code, tone, headline, detail):
    return {"code": code, "tone": tone, "headline": headline, "detail": detail}


def engine_status(state: dict, now: datetime, *, mailboxes: int, cap_left: int, due: int) -> dict:
    """Why the engine is or is not sending right now, in the engine's own gate order,
    with "is it running at all" checked first."""
    last = state.get("last_cycle_at")
    if last is None:
        return _status("never_run", "danger", "The engine has not run yet",
                       "Start a run from GitHub: emailauto-LT › Actions › Outreach engine › Run workflow.")
    gap = now - last
    if gap > (STALE_IN_WINDOW if _in_window(now) else STALE_OUTSIDE):
        minutes = int(gap.total_seconds() // 60)
        took = f"{minutes} minutes" if minutes < 120 else f"{minutes // 60} hours"
        return _status("stale", "danger", f"No engine run for {took}",
                       "Runs should come every 10 minutes in the send window and every 2 hours otherwise. "
                       "Check emailauto-LT › Actions on GitHub for a failed or disabled workflow.")
    if mailboxes == 0:
        return _status("no_mailboxes", "danger", "No mailbox is switched on",
                       "Switch one on below, or add its secrets to the engine.")
    if not state.get("sending_enabled"):
        return _status("sending_disabled", "warn", "Not sending: switched off until Stage 2",
                       "Replies are still read and logged on every run.")
    if state.get("paused"):
        return _status("paused", "warn", "Paused", state.get("paused_reason") or "Unpause it on the Mailboxes screen.")
    if state.get("inbox_status") == "error":
        return _status("inbox_error", "danger", "Inbox check failing, so sending is held",
                       state.get("inbox_detail") or "The engine could not read a mailbox.")
    if not _in_window(now):
        opens = _next_window(now).strftime("%a %d %b, %H:%M")
        return _status("outside_window", "idle", "Outside sending hours",
                       f"Weekdays 10:00–17:00 India time. Opens {opens}.")
    if cap_left <= 0:
        return _status("limit_reached", "idle", "Today's sending limit reached",
                       "Sending resumes on the next weekday. Raise a mailbox's daily cap to send more.")
    if due == 0:
        return _status("nothing_due", "idle", "Nothing due to send", "Queue a campaign's drafts to start sending.")
    return _status("sending", "ok", "Sending",
                   f"{due} due now, up to 5 per run, within each mailbox's daily cap.")


@router.get("/dashboard", response_model=s.OutreachDashboard)
def dashboard(db: Session = Depends(get_db)):
    p = {"tz": TZ_NAME}
    state = _state(db)
    kpis = dict(db.execute(KPI_SQL, p).first()._mapping)
    kpis["people_replied_30d"] = db.execute(REPLIED_SQL).scalar_one()
    queue = dict(db.execute(QUEUE_SQL).first()._mapping)
    caps = dict(db.execute(CAP_SQL, p).first()._mapping)
    kpis.update(
        due_now=queue["due_now"], queued=state["queued"], needs_review=state["needs_review"],
        cap_today=caps["cap_today"], cap_left=caps["cap_left"], bounce_pause_percent=BOUNCE_PAUSE_PERCENT,
    )
    by_type = {c: 0 for c in CATEGORIES}
    for row in db.execute(BY_TYPE_SQL):
        by_type[row.category] = row.n
    by_type["bounced"] = kpis["bounced_30d"]
    return {
        "state": state,
        "status": engine_status(state, datetime.now(timezone.utc), mailboxes=caps["mailboxes"],
                                cap_left=caps["cap_left"], due=queue["due_now"]),
        "kpis": kpis,
        "replies_by_type": by_type,
        "daily": [dict(r._mapping) for r in db.execute(DAILY_SQL, p)],
        "upcoming": [dict(r._mapping) for r in db.execute(UPCOMING_SQL, p)],
        "waiting_follow_ups": queue["waiting_follow_ups"],
    }
