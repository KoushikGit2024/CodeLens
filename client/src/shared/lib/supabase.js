import { createClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let validUrl = 'https://placeholder.supabase.co';
try {
  if (rawUrl) {
    new URL(rawUrl);
    validUrl = rawUrl;
  }
} catch (e) {
  console.warn('[Supabase] VITE_SUPABASE_URL is malformed. Falling back to placeholder.');
}

// ── Stale token eviction ──────────────────────────────────────────────────────
// If the Supabase project domain cannot be resolved, the SDK's auto-refresh loop
// hammers the network indefinitely. We evict the stored token once per session
// (the first time we detect a dead domain) to permanently silence it.
// The user will simply be signed out, which is fine for local-first usage.
(function evictStaleSupabaseSession() {
  if (rawUrl && supabaseAnonKey) return; // Do not evict if configured
  
  // Identify and remove ALL Supabase auth keys from localStorage (they start with "sb-")
  const staleKeys = Object.keys(localStorage).filter(k => k.startsWith('sb-'));
  if (staleKeys.length > 0) {
    staleKeys.forEach(k => localStorage.removeItem(k));
    console.info('[CodeLens] Cleared stale Supabase session tokens to prevent refresh loop.');
  }
})();

const isConfigured = !!(rawUrl && supabaseAnonKey);

export const supabase = createClient(validUrl, supabaseAnonKey || 'placeholder', {
  auth: {
    autoRefreshToken: isConfigured,   
    persistSession: isConfigured,     
    detectSessionInUrl: isConfigured, 
  },
});
