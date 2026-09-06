/**
 * aiProvider.js
 *
 * AI provider abstraction for CodeLens.
 *
 * ── Interface ─────────────────────────────────────────────────────────────────
 *
 *   generateAnswer(prompt: string): Promise<string>
 *
 *   Takes a fully-assembled prompt string and returns the model's text response.
 *   The caller (contextBuilder / askController) is responsible for constructing
 *   the prompt with all grounding context.
 *
 * ── Provider selection ────────────────────────────────────────────────────────
 *
 *   The active provider is determined by environment variables at startup.
 *   Currently supported:
 *
 *     Google Gemini (default when GEMINI_API_KEY is set)
 *       GEMINI_API_KEY   — Gemini API Key
 *       GEMINI_MODEL     — model ID (optional, defaults to gemini-1.5-flash)
 *
 *     OpenAI-Compatible (e.g. Groq, LMStudio, OpenRouter, OpenAI) (default when OPENAI_API_KEY is set)
 *       OPENAI_API_KEY   — API Key
 *       OPENAI_API_URL   — Endpoint (optional, defaults to https://api.openai.com/v1/chat/completions)
 *       OPENAI_MODEL     — model ID (optional, defaults to gpt-3.5-turbo)
 *
 *     IBM watsonx (default when IBM_API_KEY + IBM_PROJECT_ID are set)
 *       IBM_API_KEY      — IBM Cloud IAM API key
 *       IBM_PROJECT_ID   — watsonx.ai project ID
 *       IBM_API_URL      — watsonx.ai inference endpoint (optional, has default)
 *       IBM_MODEL_ID     — model ID to use (optional, has default)
 *
 *   If no provider is configured, generateAnswer() throws ProviderUnavailableError
 *   so callers can return a clean 503 to the client.
 *
 * ── Adding another provider ───────────────────────────────────────────────────
 *
 *   1. Create a function: async function myProvider(prompt) { ... return string }
 *   2. Add detection logic in getProvider() below.
 *   3. Document its environment variables.
 *   The rest of the codebase does not need to change.
 *
 * ── Security ──────────────────────────────────────────────────────────────────
 *
 *   Credentials are read only from environment variables.
 *   They are never logged, returned to clients, or interpolated into responses.
 */

'use strict';

const https = require('https');

// ── Error type ────────────────────────────────────────────────────────────────

class ProviderUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProviderUnavailableError';
    this.statusCode = 503;
  }
}

// ── IBM watsonx provider ──────────────────────────────────────────────────────

const IBM_DEFAULT_URL      = 'https://us-south.ml.cloud.ibm.com';
const IBM_DEFAULT_MODEL    = 'ibm/granite-13b-instruct-v2';
const IAM_TOKEN_URL        = 'https://iam.cloud.ibm.com/identity/token';

/**
 * Obtain an IBM Cloud IAM access token using the API key.
 * Tokens are valid for ~1 hour; for this MVP we fetch a fresh token per
 * request rather than caching (acceptable at low request rates).
 *
 * @param {string} apiKey
 * @returns {Promise<string>} bearer token
 */
async function getIbmAccessToken(apiKey) {
  const body = `grant_type=urn%3Aibm%3Aparams%3Aoauth%3Agrant-type%3Aapikey&apikey=${encodeURIComponent(apiKey)}`;
  const data = await httpPost(IAM_TOKEN_URL, body, {
    'Content-Type': 'application/x-www-form-urlencoded',
  });
  const parsed = JSON.parse(data);
  if (!parsed.access_token) {
    throw new Error(`IBM IAM token exchange failed: ${data}`);
  }
  return parsed.access_token;
}

/**
 * Generate text using IBM watsonx.ai.
 *
 * @param {string} prompt
 * @returns {Promise<string>}
 */
async function ibmWatsonxProvider(prompt) {
  const apiKey    = process.env.IBM_API_KEY;
  const projectId = process.env.IBM_PROJECT_ID;
  const apiUrl    = (process.env.IBM_API_URL || IBM_DEFAULT_URL).replace(/\/$/, '');
  const modelId   = process.env.IBM_MODEL_ID || IBM_DEFAULT_MODEL;

  if (!apiKey || !projectId) {
    throw new ProviderUnavailableError(
      'IBM watsonx provider is not configured. Set IBM_API_KEY and IBM_PROJECT_ID.'
    );
  }

  const accessToken = await getIbmAccessToken(apiKey);

  const endpoint = `${apiUrl}/ml/v1/text/generation?version=2023-05-29`;
  const payload = JSON.stringify({
    model_id:   modelId,
    project_id: projectId,
    input:      prompt,
    parameters: {
      decoding_method:  'greedy',
      max_new_tokens:   1024,
      repetition_penalty: 1.1,
    },
  });

  const data = await httpPost(endpoint, payload, {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${accessToken}`,
  });

  const parsed = JSON.parse(data);
  // watsonx response shape: { results: [{ generated_text: '...' }] }
  const text = parsed?.results?.[0]?.generated_text;
  if (typeof text !== 'string') {
    throw new Error(`Unexpected watsonx response shape: ${data.slice(0, 200)}`);
  }
  return text.trim();
}

// ── Google Gemini provider ────────────────────────────────────────────────────

async function geminiProvider(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192,
    }
  };

  const headers = { 'Content-Type': 'application/json' };
  const resStr = await httpPost(url, JSON.stringify(payload), headers);
  const data = JSON.parse(resStr);
  
  if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
    return data.candidates[0].content.parts[0].text.trim();
  }
  throw new Error(`Unexpected Gemini response: ${resStr.slice(0, 200)}`);
}

// ── OpenAI-Compatible provider ────────────────────────────────────────────────

async function openAiCompatibleProvider(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  const url = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions';
  const model = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';

  const payload = {
    model: model,
    messages: [
      { role: 'user', content: prompt }
    ],
    temperature: 0.1,
    max_tokens: 4096
  };

  const headers = { 
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  };
  
  const resStr = await httpPost(url, JSON.stringify(payload), headers);
  const data = JSON.parse(resStr);
  
  if (data.choices && data.choices[0]?.message?.content) {
    return data.choices[0].message.content.trim();
  }
  throw new Error(`Unexpected OpenAI-compatible response: ${resStr.slice(0, 200)}`);
}

// ── Provider registry (ordered fallback chain) ───────────────────────────────

/**
 * Build an ordered list of all currently configured providers.
 * Priority: IBM watsonx → Google Gemini → OpenAI-Compatible
 *
 * @returns {Array<{name: string, fn: function}>}
 */
function getConfiguredProviders() {
  const providers = [];
  if (process.env.IBM_API_KEY && process.env.IBM_PROJECT_ID) {
    providers.push({ name: 'IBM watsonx', fn: ibmWatsonxProvider });
  }
  if (process.env.GEMINI_API_KEY) {
    providers.push({ name: 'Google Gemini', fn: geminiProvider });
  }
  if (process.env.OPENAI_API_KEY) {
    providers.push({ name: 'OpenAI Compatible', fn: openAiCompatibleProvider });
  }
  return providers;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Verify connectivity by trying each configured provider in order.
 * Returns true (and the working provider name) on first success.
 * Returns false if all providers fail or none are configured.
 *
 * @returns {Promise<{ok: boolean, provider: string|null}>}
 */
async function verifyProviderConnection() {
  const providers = getConfiguredProviders();
  for (const { name, fn } of providers) {
    try {
      await fn("Reply with the word 'OK'.");
      console.log(`[CodeLens] AI provider verified: ${name}`);
      return { ok: true, provider: name };
    } catch (err) {
      console.warn(`[CodeLens] Provider '${name}' failed verification: ${err.message}`);
    }
  }
  return { ok: false, provider: null };
}

/**
 * Generate an answer for the given fully-assembled prompt.
 * Tries each configured provider in order; moves to the next on failure.
 * Throws ProviderUnavailableError if all providers fail or none are configured.
 *
 * @param {string} prompt  — complete prompt including all grounding context
 * @returns {Promise<string>} model response text
 * @throws {ProviderUnavailableError}
 */
async function generateAnswer(prompt) {
  const providers = getConfiguredProviders();
  if (providers.length === 0) {
    throw new ProviderUnavailableError(
      'No AI provider is configured. Set IBM_API_KEY + IBM_PROJECT_ID, GEMINI_API_KEY, or OPENAI_API_KEY in your .env file.'
    );
  }

  const errors = [];
  for (const { name, fn } of providers) {
    try {
      const result = await fn(prompt);
      if (errors.length > 0) {
        console.warn(`[CodeLens] Fell back to provider '${name}' after ${errors.length} failure(s).`);
      }
      return result;
    } catch (err) {
      console.warn(`[CodeLens] Provider '${name}' failed: ${err.message}`);
      errors.push(`${name}: ${err.message}`);
    }
  }

  throw new ProviderUnavailableError(
    `All configured AI providers failed.\n${errors.join('\n')}`
  );
}

/**
 * Returns true if at least one AI provider is currently configured.
 * Used by the health endpoint to signal whether AI features are available.
 *
 * @returns {boolean}
 */
function isProviderConfigured() {
  return getConfiguredProviders().length > 0;
}

/**
 * Returns the name of the primary (first) configured provider, or 'None'.
 *
 * @returns {string}
 */
function getProviderName() {
  const providers = getConfiguredProviders();
  return providers.length > 0 ? providers[0].name : 'None';
}

// ── Minimal HTTPS POST helper ─────────────────────────────────────────────────

/**
 * Fire an HTTPS POST request and return the response body as a string.
 * Uses only Node's built-in `https` module — no extra dependency.
 *
 * @param {string}  url
 * @param {string}  body
 * @param {object}  headers
 * @returns {Promise<string>}
 */
function httpPost(url, body, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      port:     u.port || 443,
      path:     u.pathname + u.search,
      method:   'POST',
      headers:  { ...headers, 'Content-Length': Buffer.byteLength(body) },
    };
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} from ${u.hostname}: ${text.slice(0, 300)}`));
        } else {
          resolve(text);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { generateAnswer, isProviderConfigured, getProviderName, verifyProviderConnection, ProviderUnavailableError };
