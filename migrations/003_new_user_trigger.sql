-- ============================================================================
-- CodeLens — Account, Auth, AI Access Control & Usage
-- Migration 003: Auto-provision app-level user + first usage period
--
-- When Supabase Auth creates a row in auth.users (sign-up, OAuth, etc.),
-- mirror it into our `users` table and start their first usage_periods row.
-- This keeps ai.controller.js from having to special-case "first ever request".
-- ============================================================================

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, display_name, avatar_url, plan_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url',
    'free'
  )
  on conflict (id) do nothing;

  insert into public.usage_periods (user_id, period_start, period_end)
  values (
    new.id,
    now(),
    now() + interval '30 days'
  )
  on conflict (user_id, period_start) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();
