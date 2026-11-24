"""The engine's timer: Supabase's pg_cron starts each GitHub run, because GitHub's own
schedule drops most runs on a free account.

The local test database has no pg_cron, pg_net or Vault, so these tests cover what must
hold everywhere: the migration applies without them, the functions exist, they do
nothing harmful without them, and no API role can call them.
"""

import psycopg2
import pytest

from conftest import as_role, one

FUNCTIONS = ("outreach.start_engine_run()", "outreach.set_engine_timer(boolean)")


def test_timer_functions_exist(db):
    for fn in FUNCTIONS:
        assert one(db, "select to_regprocedure(%s) is not null as ok", [fn])["ok"], fn


def test_start_engine_run_is_a_no_op_without_pg_net_or_vault(db):
    assert one(db, "select outreach.start_engine_run() as id")["id"] is None


def test_set_engine_timer_reports_no_jobs_without_pg_cron(db):
    assert one(db, "select outreach.set_engine_timer(false) as n")["n"] == 0


@pytest.mark.parametrize("role", ["anon", "authenticated"])
@pytest.mark.parametrize("call", ["select outreach.start_engine_run()", "select outreach.set_engine_timer(false)"])
def test_api_roles_cannot_start_or_switch_the_engine(db, role, call):
    with pytest.raises(psycopg2.Error):
        as_role(db, role, call)
