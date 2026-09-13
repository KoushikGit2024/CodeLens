-- ============================================================================
-- CodeLens — Account, Auth, AI Access Control & Usage
-- Migration 001: Initial schema
--
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- Depends on: auth.users (provided automatically by Supabase Auth).
-- ============================================================================

-- ── plans ────────────────────────────────────────────────────────────────
-- Centralized limit definitions. No limits are hard-coded in app code.
create table if not exists plans (
  id                      text primary key,          -- 'free', 'pro', etc.
  display_name            text not null,
  ai_requests_per_month   integer not null,           -- -1 = unlimited
  ai_tokens_per_month     bigint  not null,           -- -1 = unlimited
  storage_bytes           bigint  not null,           -- -1 = unlimited
  image_count_limit       integer not null,           -- -1 = unlimited
  repo_count_limit        integer not null,           -- -1 = unlimited
  created_at              timestamptz default now()
);

-- Seed the default free plan (idempotent).
insert into plans (id, display_name, ai_requests_per_month, ai_tokens_per_month, storage_bytes, image_count_limit, repo_count_limit)
values ('free', 'Free', 100, 500000, 104857600, 20, 10)
on conflict (id) do nothing;

-- ── users ────────────────────────────────────────────────────────────────
-- Mirrors Supabase Auth's auth.users table. Extended with app-specific fields.
create table if not exists users (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  display_name  text,
  avatar_url    text,
  plan_id       text not null references plans(id) default 'free',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  last_active   timestamptz default now(),
  status        text not null default 'active'  -- 'active', 'suspended', 'deleted'
);

-- ── usage_periods ────────────────────────────────────────────────────────
-- One row per user per billing period. Rolling 30-day window.
create table if not exists usage_periods (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id),
  period_start  timestamptz not null,
  period_end    timestamptz not null,
  ai_requests   integer not null default 0,
  ai_tokens     bigint  not null default 0,
  storage_bytes bigint  not null default 0,
  image_count   integer not null default 0,
  created_at    timestamptz default now(),
  unique (user_id, period_start)
);

-- ── ai_requests ──────────────────────────────────────────────────────────
-- Audit log for every AI call. Source of truth for token accounting.
create table if not exists ai_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id),
  created_at      timestamptz default now(),
  provider        text not null,        -- 'gemini', 'ibm-watsonx', 'openai'
  feature         text,                 -- 'chat', 'documentation', 'refactoring', etc.
  status          text not null,        -- 'success', 'failed', 'quota_exceeded'
  -- Token accounting (provider-reported where available, estimated otherwise)
  input_tokens    integer,
  output_tokens   integer,
  total_tokens    integer,
  token_source    text not null,        -- 'provider_reported' | 'estimated'
  prompt_chars    integer,
  response_chars  integer,
  latency_ms      integer,
  error_message   text
);

-- ── stored_assets ────────────────────────────────────────────────────────
-- Metadata for files/images stored in ImageKit.
create table if not exists stored_assets (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users(id),
  imagekit_file_id  text unique,
  url               text not null,
  file_path         text,
  mime_type         text,
  size_bytes        bigint not null,
  purpose           text,
  created_at        timestamptz default now(),
  deleted_at        timestamptz
);

-- ── Indexes ──────────────────────────────────────────────────────────────
create index if not exists idx_usage_periods_user_id   on usage_periods(user_id);
create index if not exists idx_ai_requests_user_id      on ai_requests(user_id);
create index if not exists idx_ai_requests_created_at   on ai_requests(created_at);
create index if not exists idx_stored_assets_user_id    on stored_assets(user_id);
