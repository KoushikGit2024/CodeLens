-- ============================================================================
-- CodeLens — Account, Auth, AI Access Control & Usage
-- Migration 002: Row Level Security
--
-- The Express server uses the SUPABASE_SERVICE_ROLE_KEY for all writes, which
-- bypasses RLS entirely. These policies protect the tables in case the anon
-- key is ever used to query Postgres directly from the browser (e.g. future
-- read-only dashboards), and are a defense-in-depth measure.
-- ============================================================================

alter table users          enable row level security;
alter table usage_periods  enable row level security;
alter table ai_requests    enable row level security;
alter table stored_assets  enable row level security;

-- plans is public reference data — no RLS needed, but keep it read-only to anon.
alter table plans enable row level security;
create policy "plans_select_all" on plans
  for select using (true);

-- users: a user may only see/update their own row.
create policy "users_select_own" on users
  for select using (auth.uid() = id);
create policy "users_update_own" on users
  for update using (auth.uid() = id);

-- usage_periods: a user may only see their own usage.
create policy "usage_periods_select_own" on usage_periods
  for select using (auth.uid() = user_id);

-- ai_requests: a user may only see their own request log.
create policy "ai_requests_select_own" on ai_requests
  for select using (auth.uid() = user_id);

-- stored_assets: a user may only see/manage their own assets.
create policy "stored_assets_select_own" on stored_assets
  for select using (auth.uid() = user_id);
create policy "stored_assets_delete_own" on stored_assets
  for delete using (auth.uid() = user_id);
