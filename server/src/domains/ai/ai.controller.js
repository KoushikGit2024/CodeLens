'use strict';

const aiProvider = require('../../core/ai/ai.provider');

/**
 * Handle AI prompt generation (Proxy to Watsonx)
 */
async function generateChat(req, res, next) {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Missing prompt in request body.' });
    }
    
    // Call the AI provider (WatsonX)
    const responseText = await aiProvider.generateAnswer(prompt);
    
    return res.json({ response: responseText });
  } catch (error) {
    if (error.name === 'ProviderUnavailableError') {
      return res.status(503).json({ error: error.message });
    }
    next(error);
  }
}

/**
 * Health check for the AI provider
 */
async function healthCheck(req, res, next) {
  try {
    const providerName = aiProvider.getProviderName();
    res.json({ status: 'ok', provider: providerName });
  } catch (error) {
    if (error.name === 'ProviderUnavailableError') {
      return res.status(503).json({ status: 'unavailable', error: error.message });
    }
    next(error);
  }
}

module.exports = {
  generateChat,
  healthCheck
};
