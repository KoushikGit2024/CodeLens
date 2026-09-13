-- ============================================================================
-- CodeLens — Account, Auth, AI Access Control & Usage
-- Migration 004: Atomic usage increment RPC
--
-- Called by server/src/core/auth/usage.recorder.js via supabase.rpc(...).
-- Uses a row lock so concurrent requests near the quota boundary can't both
-- slip through (see Phase G "Concurrent Request Race Condition" in the plan).
-- ============================================================================

create or replace function public.increment_usage_period(
  p_period_id uuid,
  p_requests integer,
  p_tokens bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1 from usage_periods where id = p_period_id for update;

  update usage_periods
  set ai_requests = ai_requests + p_requests,
      ai_tokens   = ai_tokens + p_tokens
  where id = p_period_id;
end;
$$;
  