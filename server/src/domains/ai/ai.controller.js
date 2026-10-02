'use strict';

const aiProvider = require('../../core/ai/ai.provider');
const aiService = require('../../core/ai/ai.service');
const { recordUsage } = require('../../core/auth/usage.recorder');
const crypto = require('crypto');

// In-memory job store for async AI requests
const activeJobs = new Map();

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
 * Handle AI prompt generation (Proxy to AI Provider)
 * Converts to Async Webhook pattern to prevent frontend timeouts.
 */
async function generateChat(req, res, next) {
  const { prompt, history, jsonMode, feature } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Missing prompt in request body.' });
  }

  const finalPrompt = Array.isArray(history) && history.length > 0 ? formatWithHistory(prompt, history) : prompt;

  const jobId = crypto.randomUUID();
  activeJobs.set(jobId, { status: 'processing', result: null, error: null });

  // Return immediately to frontend
  res.status(202).json({ jobId, status: 'processing' });

  // Process AI request in the background
  processAiJob(jobId, req, finalPrompt, jsonMode, feature).catch(err => {
    console.error(`[AI Job ${jobId}] Unhandled background error:`, err);
  });
}

async function processAiJob(jobId, req, finalPrompt, jsonMode, feature) {
  const startedAt = Date.now();
  try {
    if (jsonMode) {
      const json = await aiService.generateStructuredResponse(finalPrompt);
      const responseText = JSON.stringify(json);
      const estimatedInput = finalPrompt.length / 4;
      const estimatedOutput = responseText.length / 4;

      await recordUsage(req, {
        provider: aiProvider.getProviderName(),
        feature: feature || 'chat_json',
        status: 'success',
        usage: {
          input_tokens: estimatedInput,
          output_tokens: estimatedOutput,
          total_tokens: estimatedInput + estimatedOutput,
          source: 'estimated',
        },
        promptChars: finalPrompt.length,
        responseChars: responseText.length,
        latencyMs: Date.now() - startedAt,
      });

      activeJobs.set(jobId, { status: 'completed', result: responseText });
    } else {
      const { text, usage } = await aiProvider.generateAnswer(finalPrompt);

      await recordUsage(req, {
        provider: aiProvider.getProviderName(),
        feature: feature || 'chat',
        status: 'success',
        usage: usage,
        promptChars: finalPrompt.length,
        responseChars: text.length,
        latencyMs: Date.now() - startedAt,
      });

      activeJobs.set(jobId, { status: 'completed', result: text });
    }
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

    activeJobs.set(jobId, {
      status: 'failed',
      error: isUnavailable ? 'AI providers are currently unavailable due to high demand.' : error.message,
    });
  }

  // Cleanup job after 1 hour to prevent memory leaks
  setTimeout(
    () => {
      activeJobs.delete(jobId);
    },
    60 * 60 * 1000
  );
}

/**
 * Poll endpoint for the frontend to check job status.
 */
function getJobStatus(req, res) {
  const { jobId } = req.params;
  const job = activeJobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found or expired.' });
  }

  return res.json(job);
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
    const { data: userRow } = await supabase.from('users').select('plan_id').eq('id', userId).single();

    const planId = userRow ? userRow.plan_id : 'free';

    const { data: plan } = await supabase.from('plans').select('*').eq('id', planId).single();

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
      usage: period
        ? {
            requests: period.ai_requests,
            requestLimit: plan ? plan.ai_requests_per_month : null,
            tokens: period.ai_tokens,
            tokenLimit: plan ? plan.ai_tokens_per_month : null,
            periodEnd: period.period_end,
          }
        : null,
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
  getJobStatus,
};
