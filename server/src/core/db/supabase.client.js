/**
 * supabase.client.js
 *
 * Server-only Supabase client using the service-role key. This bypasses
 * Row Level Security entirely, so every query built on top of this client
 * MUST manually scope by user_id (see quota.middleware.js / usage.recorder.js).
 *
 * Never import this file from client-side code. Never log or return
 * SUPABASE_SERVICE_ROLE_KEY.
 */

'use strict';

const { createClient } = require('@supabase/supabase-js');

let client = null;

function getSupabaseClient() {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server/.env'
    );
  }

  client = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return client;
}

function isSupabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

module.exports = { getSupabaseClient, isSupabaseConfigured };
