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

// ── Provider registry ─────────────────────────────────────────────────────────

/**
 * Return the active provider function, or throw ProviderUnavailableError.
 *
 * @returns {function(string): Promise<string>}
 */
function getProvider() {
  if (process.env.GEMINI_API_KEY) {
    return geminiProvider;
  }
  if (process.env.OPENAI_API_KEY) {
    return openAiCompatibleProvider;
  }
  if (process.env.IBM_API_KEY && process.env.IBM_PROJECT_ID) {
    return ibmWatsonxProvider;
  }
  throw new ProviderUnavailableError(
    'No AI provider is configured. Set GEMINI_API_KEY, OPENAI_API_KEY, or IBM_API_KEY + IBM_PROJECT_ID in your .env file.'
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Verify the connection to the configured AI provider.
 * Makes a tiny test request to ensure the API key and endpoint are valid.
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
async function verifyProviderConnection() {
  if (!isProviderConfigured()) return false;
  try {
    const provider = getProvider();
    // A very tiny prompt just to get a 200 OK response
    await provider("Reply with the word 'OK'.");
    return true;
  } catch (error) {
    console.error('[CodeLens] AI connection verification failed:', error.message);
    return false;
  }
}

/**
 * Generate an answer for the given fully-assembled prompt.
 *
 * @param {string} prompt  — complete prompt including all grounding context
 * @returns {Promise<string>} model response text
 * @throws {ProviderUnavailableError} if no provider is configured
 * @throws {Error} if the provider call fails
 */
async function generateAnswer(prompt) {
  const provider = getProvider();
  return provider(prompt);
}

/**
 * Returns true if an AI provider is currently configured.
 * Used by the API to return a helpful 503 without attempting a call.
 *
 * @returns {boolean}
 */
function isProviderConfigured() {
  return !!(
    process.env.GEMINI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    (process.env.IBM_API_KEY && process.env.IBM_PROJECT_ID)
  );
}

/**
 * Returns the name of the active configured provider.
 *
 * @returns {string}
 */
function getProviderName() {
  if (process.env.GEMINI_API_KEY) return 'Google Gemini';
  if (process.env.OPENAI_API_KEY) return 'OpenAI Compatible';
  if (process.env.IBM_API_KEY && process.env.IBM_PROJECT_ID) return 'IBM watsonx';
  return 'None';
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
