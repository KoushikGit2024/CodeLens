'use strict';

const aiProvider = require('../../core/ai/ai.provider');
const aiService = require('../../core/ai/ai.service');
const { recordUsage } = require('../../core/auth/usage.recorder');

function isSupabaseAvailable() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Prepend the last N turns of conversation history to the prompt so the model
 * has multi-turn memory without restructuring the provider interface.
 */
function formatWithHistory(prompt, history) {
  const turns = history
    .slice(-10) // bound context growth to last 10 messages
    .map(m => {
      const role = m.role === 'user' ? 'User' : 'Assistant';
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      return `${role}: ${content}`;
    })
    .join('\n\n');
  return `Conversation so far:\n${turns}\n\nUser: ${prompt}`;
}

/**
 * Handle AI prompt generation (Proxy to Watsonx/Gemini)
 * Now requires req.user (authMiddleware) and req.quota (quotaMiddleware).
 * Every outcome — success, provider failure, or unexpected error — is logged
 * via recordUsage() so usage_periods stays accurate even on failure paths.
 */
async function generateChat(req, res, next) {
  const startedAt = Date.now();
  const { prompt, history, jsonMode, feature } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Missing prompt in request body.' });
  }

  const finalPrompt = Array.isArray(history) && history.length > 0
    ? formatWithHistory(prompt, history)
    : prompt;

  try {
    if (jsonMode) {
      const json = await aiService.generateStructuredResponse(finalPrompt);
      const responseText = JSON.stringify(json);

      await recordUsage(req, {
        provider: aiProvider.getProviderName(),
        feature: feature || 'chat_json',
        status: 'success',
        promptChars: finalPrompt.length,
        responseChars: responseText.length,
        latencyMs: Date.now() - startedAt,
      });

      return res.json({ response: responseText });
    }

    const responseText = await aiProvider.generateAnswer(finalPrompt);

    await recordUsage(req, {
      provider: aiProvider.getProviderName(),
      feature: feature || 'chat',
      status: 'success',
      promptChars: finalPrompt.length,
      responseChars: responseText.length,
      latencyMs: Date.now() - startedAt,
    });

    return res.json({ response: responseText });

  } catch (error) {
    const isUnavailable = error.name === 'ProviderUnavailableError' || error.statusCode === 503;

    await recordUsage(req, {
      provider: aiProvider.getProviderName(),
      feature: feature || 'chat',
      status: 'failed',
      promptChars: finalPrompt.length,
      latencyMs: Date.now() - startedAt,
      errorMessage: error.message,
    });

    if (isUnavailable) {
      return res.status(503).json({ error: error.message });
    }
    console.error('[AI Provider Error]', error);
    return res.status(500).json({ error: error.message || 'An unexpected error occurred during AI generation.' });
  }
}

/**
 * Health check for the AI provider (unauthenticated, server-level).
 */
async function healthCheck(req, res, next) {
  try {
    const providerName = aiProvider.getProviderName();
    const configured = aiProvider.isProviderConfigured();
    res.json({ status: 'ok', provider: providerName, configured });
  } catch (error) {
    if (error.name === 'ProviderUnavailableError') {
      return res.status(503).json({ status: 'unavailable', configured: false, error: error.message });
    }
    next(error);
  }
}

/**
 * Auth-aware status endpoint for the client AI state machine (Phase 5/6).
 * Requires authMiddleware to have already populated req.user.
 */
async function statusCheck(req, res, next) {
  try {
    const configured = aiProvider.isProviderConfigured();
    const userId = req.user.id;

    const { getSupabaseClient } = require('../../core/db/supabase.client');
    const supabase = getSupabaseClient();
    const { data: userRow } = await supabase
      .from('users')
      .select('plan_id')
      .eq('id', userId)
      .single();

    const planId = userRow ? userRow.plan_id : 'free';

    const { data: plan } = await supabase
      .from('plans')
      .select('*')
      .eq('id', planId)
      .single();

    const { data: periods } = await supabase
      .from('usage_periods')
      .select('*')
      .eq('user_id', userId)
      .order('period_start', { ascending: false })
      .limit(1);

    const period = periods && periods[0];

    const requestsExceeded =
      plan && plan.ai_requests_per_month !== -1 && period && period.ai_requests >= plan.ai_requests_per_month;
    const tokensExceeded =
      plan && plan.ai_tokens_per_month !== -1 && period && period.ai_tokens >= plan.ai_tokens_per_month;

    const quotaStatus = requestsExceeded || tokensExceeded ? 'exhausted' : 'available';

    return res.json({
      authState: 'authenticated',
      providerConfigured: configured,
      quotaStatus,
      usage: period ? {
        requests: period.ai_requests,
        requestLimit: plan ? plan.ai_requests_per_month : null,
        tokens: period.ai_tokens,
        tokenLimit: plan ? plan.ai_tokens_per_month : null,
        periodEnd: period.period_end,
      } : null,
    });
  } catch (error) {
    console.error('[AI Status Error]', error);
    return res.status(500).json({ error: 'Failed to fetch AI status' });
  }
}

module.exports = {
  generateChat,
  healthCheck,
  statusCheck,
};
