-- LambTech Desk: lock the schema down (spec §9).
--
-- Only the backend talks to this database, as the postgres role through the
-- session pooler. Supabase's API roles (anon, authenticated) get nothing, so
-- the public anon key is useless against this data, and row-level security is
-- on everywhere as a second wall.

alter table companies    enable row level security;
alter table contacts     enable row level security;
alter table emails_sent  enable row level security;
alter table responses    enable row level security;
alter table leads        enable row level security;
alter table transactions enable row level security;
alter table milestones   enable row level security;
alter table payments     enable row level security;
alter table suppressions enable row level security;

-- Supabase grants anon and authenticated everything in public by default;
-- take it back, including the right to call public functions.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

-- ... and for anything a later migration creates.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;
