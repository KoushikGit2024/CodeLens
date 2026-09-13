import { createClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let validUrl = 'https://placeholder.supabase.co';
try {
  if (rawUrl) {
    new URL(rawUrl); // This throws if the URL is completely malformed (e.g., missing https://)
    validUrl = rawUrl;
  }
} catch (e) {
  console.warn('[Supabase] VITE_SUPABASE_URL is malformed. Falling back to placeholder to prevent crash.');
}

if (!rawUrl || !supabaseAnonKey) {
  console.warn('[Supabase] Environment variables VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY are missing.');
}

export const supabase = createClient(validUrl, supabaseAnonKey || 'placeholder', {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
