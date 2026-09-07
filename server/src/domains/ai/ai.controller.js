'use strict';

const aiProvider = require('../../core/ai/ai.provider');
const aiService = require('../../core/ai/ai.service');

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
 * Supports:
 *  - history: array of {role, content} messages for multi-turn memory
 *  - jsonMode: route through ai.service.js for JSON extraction + retries
 */
async function generateChat(req, res, next) {
  try {
    const { prompt, history, jsonMode } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Missing prompt in request body.' });
    }

    const finalPrompt = Array.isArray(history) && history.length > 0
      ? formatWithHistory(prompt, history)
      : prompt;

    if (jsonMode) {
      // Route JSON requests through ai.service.js — gets timeout, retries, and JSON extraction
      const json = await aiService.generateStructuredResponse(finalPrompt);
      // Keep the client contract intact: return response as a JSON string
      return res.json({ response: JSON.stringify(json) });
    }

    // Plain text — go direct to provider for lowest latency
    const responseText = await aiProvider.generateAnswer(finalPrompt);
    return res.json({ response: responseText });

  } catch (error) {
    if (error.name === 'ProviderUnavailableError' || error.statusCode === 503) {
      return res.status(503).json({ error: error.message });
    }
    console.error('[AI Provider Error]', error);
    return res.status(500).json({ error: error.message || 'An unexpected error occurred during AI generation.' });
  }
}

/**
 * Health check for the AI provider
 */
async function healthCheck(req, res, next) {
  try {
    const providerName = aiProvider.getProviderName();
    const configured = aiProvider.isProviderConfigured();
    console.log(`[CodeLens] /ai/health → configured=${configured}, provider=${providerName}`);
    res.json({ status: 'ok', provider: providerName, configured });
  } catch (error) {
    if (error.name === 'ProviderUnavailableError') {
      return res.status(503).json({ status: 'unavailable', configured: false, error: error.message });
    }
    next(error);
  }
}

module.exports = {
  generateChat,
  healthCheck
};
