/**
 * usage.recorder.js
 *
 * Called after ai.controller.js gets a response (success or failure) from
 * the AI provider. Writes an audit row to ai_requests and increments the
 * running totals on usage_periods. Never throws — a logging failure must
 * not break the user's AI response.
 *
 * Usage:
 *   await recordUsage(req, {
 *     provider: 'gemini',
 *     feature: 'chat',
 *     status: 'success',
 *     usage: { input_tokens, output_tokens, total_tokens, source },
 *     promptChars, responseChars, latencyMs,
 *   });
 */

'use strict';

const { getSupabaseClient } = require('../db/supabase.client');

function estimateTokens(chars) {
  if (!chars) return 0;
  return Math.ceil(chars / 4);
}

async function recordUsage(req, {
  provider,
  feature = null,
  status,
  usage = null,
  promptChars = null,
  responseChars = null,
  latencyMs = null,
  errorMessage = null,
}) {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return;

    const supabase = getSupabaseClient();

    let inputTokens = usage && usage.input_tokens != null ? usage.input_tokens : null;
    let outputTokens = usage && usage.output_tokens != null ? usage.output_tokens : null;
    let totalTokens = usage && usage.total_tokens != null ? usage.total_tokens : null;
    let tokenSource = usage && usage.source ? usage.source : 'estimated';

    // Provider gave nothing usable — fall back to a rough char-based estimate,
    // but only for successful requests (failed/quota_exceeded count 0 tokens).
    if (totalTokens == null && status === 'success') {
      totalTokens = estimateTokens(promptChars) + estimateTokens(responseChars);
      tokenSource = 'estimated';
    }
    if (totalTokens == null) totalTokens = 0;

    await supabase.from('ai_requests').insert({
      user_id: userId,
      provider,
      feature,
      status,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      token_source: tokenSource,
      prompt_chars: promptChars,
      response_chars: responseChars,
      latency_ms: latencyMs,
      error_message: errorMessage,
    });

    // Only successful, quota-checked requests count against the running total.
    if (status === 'success' && req.quota && req.quota.period) {
      const periodId = req.quota.period.id;
      const { error } = await supabase.rpc('increment_usage_period', {
        p_period_id: periodId,
        p_requests: 1,
        p_tokens: totalTokens,
      });

      if (error) {
        // Fallback: non-atomic increment if the RPC function isn't installed yet.
        console.warn('[usage.recorder] increment_usage_period RPC failed, falling back:', error.message);
        await supabase
          .from('usage_periods')
          .update({
            ai_requests: req.quota.period.ai_requests + 1,
            ai_tokens: req.quota.period.ai_tokens + totalTokens,
          })
          .eq('id', periodId);
      }
    }
  } catch (err) {
    console.error('[usage.recorder] Failed to record usage (non-fatal):', err);
  }
}

module.exports = { recordUsage };
