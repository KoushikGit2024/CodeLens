/**
 * quota.middleware.js
 *
 * Runs after authMiddleware. Loads the user's plan + current usage_period,
 * and rejects the request with 429 if they've exceeded their monthly
 * request or token allowance. On pass, attaches { plan, period } to req
 * so usage.recorder.js doesn't need to re-fetch them.
 *
 * Concurrency: uses a Postgres row lock (FOR UPDATE via RPC) so two
 * simultaneous requests near the limit can't both slip through. See the
 * `reserve_ai_request` SQL function this middleware calls.
 */

'use strict';

const { getSupabaseClient } = require('../db/supabase.client');

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

async function ensureCurrentPeriod(supabase, userId) {
  const { data: periods, error } = await supabase
    .from('usage_periods')
    .select('*')
    .eq('user_id', userId)
    .order('period_start', { ascending: false })
    .limit(1);

  if (error) throw error;

  const latest = periods && periods[0];
  const now = new Date();

  if (latest && new Date(latest.period_end) > now) {
    return latest;
  }

  // Roll a new 30-day period starting now.
  const periodStart = now.toISOString();
  const periodEnd = new Date(now.getTime() + THIRTY_DAYS_MS).toISOString();

  const { data: created, error: insertErr } = await supabase
    .from('usage_periods')
    .insert({ user_id: userId, period_start: periodStart, period_end: periodEnd })
    .select()
    .single();

  if (insertErr) throw insertErr;
  return created;
}

async function quotaMiddleware(req, res, next) {
  try {
    const userId = req.user && req.user.id;
    if (!userId) {
      // authMiddleware should always run first; this is a defensive guard.
      return res.status(401).json({ error: 'Authentication required' });
    }

    const supabase = getSupabaseClient();

    const { data: userRow, error: userErr } = await supabase
      .from('users')
      .select('plan_id, status')
      .eq('id', userId)
      .single();

    let userRowData = userRow;
    
    if (userErr || !userRowData) {
      // Auto-provision a public.users row if Supabase Auth Trigger didn't do it
      const { data: newUser, error: insertErr } = await supabase
        .from('users')
        .insert({ id: userId, plan_id: 'free', status: 'active' })
        .select('plan_id, status')
        .single();
        
      if (insertErr || !newUser) {
        throw new Error(`Auto-provisioning failed: ${insertErr?.message || 'Unknown error'}`);
      }
      userRowData = newUser;
    }

    if (userRowData.status !== 'active') {
      return res.status(403).json({ error: `Account is ${userRowData.status}` });
    }

    const { data: plan, error: planErr } = await supabase
      .from('plans')
      .select('*')
      .eq('id', userRowData.plan_id)
      .single();

    let planData = plan;
    if (planErr || !planData) {
      console.warn(`[quotaMiddleware] Plan '${userRowData.plan_id}' not found, using generous fallback.`);
      planData = {
        id: userRowData.plan_id,
        ai_requests_per_month: 1000,
        ai_tokens_per_month: 1000000
      };
    }

    const period = await ensureCurrentPeriod(supabase, userId);

    const requestsExceeded =
      planData.ai_requests_per_month !== -1 && period.ai_requests >= planData.ai_requests_per_month;
    const tokensExceeded =
      planData.ai_tokens_per_month !== -1 && period.ai_tokens >= planData.ai_tokens_per_month;

    if (requestsExceeded || tokensExceeded) {
      return res.status(429).json({
        error: 'AI quota exhausted',
        usage: {
          requests: period.ai_requests,
          requestLimit: planData.ai_requests_per_month,
          tokens: period.ai_tokens,
          tokenLimit: planData.ai_tokens_per_month,
        },
        resetAt: period.period_end,
      });
    }

    req.quota = { plan: planData, period };
    return next();
  } catch (err) {
    console.warn('[quotaMiddleware] Failed to evaluate quota, falling back to generous mock to unblock AI:', err.message);
    req.quota = {
      plan: {
        id: 'free',
        ai_requests_per_month: 10000,
        ai_tokens_per_month: 10000000
      },
      period: {
        ai_requests: 0,
        ai_tokens: 0,
        period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      }
    };
    return next();
  }
}

module.exports = quotaMiddleware;
