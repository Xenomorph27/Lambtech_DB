-- The engine's timer.
--
-- GitHub's own schedule drops most runs on a free account (a 10-minute cron was
-- seen firing about every 10 hours), so Supabase keeps time instead: pg_cron
-- asks GitHub to start the "Outreach engine" workflow, and pg_net makes that
-- call. Same cadence as the workflow's own crons, in UTC:
--   every 10 minutes, Monday-Friday 04:00-11:59 UTC (09:30-17:29 India): the send window
--   every 2 hours otherwise, so replies are still read at night and at weekends
-- It also keeps the desk API on Render awake, which the GitHub keep-awake
-- workflow was meant to do.
--
-- The GitHub token lives only in Supabase Vault, typed in by a person:
--   select vault.create_secret('<token>', 'github_engine_dispatch');
-- (fine-grained token, repository emailauto-LT only, permission Actions: read and write)
--
-- Stop or start the engine's timer (the keep-awake ping is not affected):
--   select outreach.set_engine_timer(false);
--   select outreach.set_engine_timer(true);
--
-- Without pg_cron and pg_net (the local test database) the functions are
-- created and do nothing.

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron with schema pg_catalog;
    create extension if not exists pg_net with schema extensions;
  end if;
end
$$;

-- Asks GitHub to start one engine run. Returns pg_net's request id, or null when
-- there is no pg_net, no Vault or no token (nothing is sent then).
create or replace function outreach.start_engine_run() returns bigint
language plpgsql
set search_path = ''
as $$
declare
  token text;
begin
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null
     or to_regclass('vault.decrypted_secrets') is null then
    return null;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1'
    into token using 'github_engine_dispatch';
  if token is null or token = '' then
    return null;
  end if;
  return net.http_post(
    url := 'https://api.github.com/repos/Xenomorph27/emailauto-LT/actions/workflows/engine.yml/dispatches',
    body := '{"ref": "main"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || token,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'lambtech-desk-timer',
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 10000
  );
end
$$;

-- Switches the engine's timer jobs on or off. Returns how many jobs it changed.
create or replace function outreach.set_engine_timer(enabled boolean) returns integer
language plpgsql
set search_path = ''
as $$
declare
  job record;
  changed integer := 0;
begin
  if to_regclass('cron.job') is null then
    return 0;
  end if;
  for job in execute 'select jobid from cron.job where jobname like $1' using 'outreach-engine-%' loop
    execute 'select cron.alter_job($1, active => $2)' using job.jobid, enabled;
    changed := changed + 1;
  end loop;
  insert into outreach.events (kind, detail)
  values ('timer', case when enabled then 'Engine timer switched on' else 'Engine timer switched off' end);
  return changed;
end
$$;

revoke all on function outreach.start_engine_run() from public, anon, authenticated;
revoke all on function outreach.set_engine_timer(boolean) from public, anon, authenticated;

do $$
begin
  if to_regclass('cron.job') is null then
    return;
  end if;
  perform cron.schedule('outreach-engine-window', '*/10 4-11 * * 1-5', 'select outreach.start_engine_run()');
  perform cron.schedule('outreach-engine-offhours', '17 */2 * * *', 'select outreach.start_engine_run()');
  perform cron.schedule('desk-api-keep-awake', '*/10 * * * *',
    $cmd$select net.http_get('https://lambtech-desk-api.onrender.com/health')$cmd$);
  -- pg_cron keeps a row per run; a week is plenty.
  perform cron.schedule('cron-history-cleanup', '30 0 * * *',
    $cmd$delete from cron.job_run_details where end_time < now() - interval '7 days'$cmd$);
end
$$;
