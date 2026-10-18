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
 *     Groq (default when GROQ_API_KEY is set)
 *       GROQ_API_KEY     — Groq API Key
 *       GROQ_MODEL       — model ID (optional, defaults to llama-3.1-8b-instant)
 *
 *     OpenAI-Compatible (e.g. Groq, LMStudio, OpenRouter, OpenAI) (default when OPENAI_API_KEY is set)
 *       OPENAI_API_KEY   — API Key
 *       OPENAI_API_URL   — Endpoint (optional, defaults to https://api.openai.com/v1/chat/completions)
 *       OPENAI_MODEL     — model ID (optional, defaults to gpt-3.5-turbo)
 *
 *     Generic LLM (default when LLM_API_KEY + LLM_PROJECT_ID are set)
 *       LLM_API_KEY      — Generic API key
 *       LLM_PROJECT_ID   — Generic project ID
 *       LLM_API_URL      — Generic inference endpoint (optional, has default)
 *       LLM_MODEL_ID     — model ID to use (optional, has default)
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

// ── Token Estimation Fallback ──────────────────────────────────────────────────

/**
 * Fallback token estimator if the API provider doesn't return exact token counts.
 * Uses a standard 4 characters per token heuristic (approx. cl100k_base).
 */
function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  return Math.ceil(text.length / 4);
}

// ── Generic LLM provider ──────────────────────────────────────────────────────
const LLM_DEFAULT_URL = 'https://api.your-provider.com';
const LLM_DEFAULT_MODEL = 'generic-llm-instruct-v2';
const IAM_TOKEN_URL = 'https://auth.your-provider.com/token';

/**
 * Obtain a Generic access token using the API key.
 * Tokens are valid for ~1 hour; for this MVP we fetch a fresh token per
 * request rather than caching (acceptable at low request rates).
 *
 * @param {string} apiKey
 * @returns {Promise<string>} bearer token
 */
async function getLlmAccessToken(apiKey) {
  const body = `grant_type=apikey&apikey=${encodeURIComponent(apiKey)}`;
  const data = await httpPost(IAM_TOKEN_URL, body, {
    'Content-Type': 'application/x-www-form-urlencoded',
  });
  const parsed = JSON.parse(data);
  if (!parsed.access_token) {
    throw new Error(`Generic token exchange failed: ${data}`);
  }
  return parsed.access_token;
}

/**
 * Generate text using Generic LLM.
 *
 * @param {string} prompt
 * @returns {Promise<string>}
 */
async function genericLlmProvider(prompt) {
  const apiKey = process.env.LLM_API_KEY;
  const projectId = process.env.LLM_PROJECT_ID;
  const apiUrl = (process.env.LLM_API_URL || LLM_DEFAULT_URL).replace(/\/$/, '');
  const modelId = process.env.LLM_MODEL_ID || LLM_DEFAULT_MODEL;

  if (!apiKey || !projectId) {
    throw new ProviderUnavailableError('Generic LLM provider is not configured. Set LLM_API_KEY and LLM_PROJECT_ID.');
  }

  const accessToken = await getLlmAccessToken(apiKey);

  const endpoint = `${apiUrl}/ml/v1/text/generation?version=2023-05-29`;
  const payload = JSON.stringify({
    model_id: modelId,
    project_id: projectId,
    input: prompt,
    parameters: {
      decoding_method: 'greedy',
      max_new_tokens: 1024,
      repetition_penalty: 1.1,
    },
  });

  const data = await httpPost(endpoint, payload, {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  });

  const parsed = JSON.parse(data);
  const result = parsed?.results?.[0];
  const text = result?.generated_text;
  if (typeof text !== 'string') {
    throw new Error(`Unexpected LLM response shape: ${data.slice(0, 200)}`);
  }

  const estimatedInput = estimateTokens(prompt);
  const estimatedOutput = estimateTokens(text);

  return {
    text: text.trim(),
    usage: {
      input_tokens: result?.input_token_count ?? estimatedInput,
      output_tokens: result?.generated_token_count ?? estimatedOutput,
      total_tokens: (result?.input_token_count ?? estimatedInput) + (result?.generated_token_count ?? estimatedOutput),
      source: result?.input_token_count != null ? 'provider_reported' : 'estimated',
    },
  };
}

// ── Multi-model parser helper & model cooldown tracker ────────────────────────

const DEFAULT_GEMINI_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-exp',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro',
  'gemini-flash-latest',
];

const DEFAULT_GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'mixtral-8x7b-32768',
  'gemma2-9b-it',
  'llama-3.2-11b-vision-preview',
  'llama-3.2-3b-preview',
  'llama3-70b-8192',
  'llama3-8b-8192',
  'qwen/qwen3.8-27b',
];

// In-memory model cooldown tracking (skips known rate-limited or unavailable models)
const modelCooldowns = new Map();

function isModelAvailable(providerKey, model) {
  const key = `${providerKey}:${model}`;
  const expiry = modelCooldowns.get(key);
  if (!expiry) return true;
  if (Date.now() > expiry) {
    modelCooldowns.delete(key);
    return true;
  }
  return false;
}

function setModelCooldown(providerKey, model, durationMs = 60000) {
  const key = `${providerKey}:${model}`;
  modelCooldowns.set(key, Date.now() + durationMs);
}

function parseModelList(envValue, defaultList) {
  if (!envValue || typeof envValue !== 'string') return defaultList;
  const parsed = envValue
    .split(',')
    .map(m => m.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : defaultList;
}

// ── Google Gemini provider ────────────────────────────────────────────────────

async function geminiProvider(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  const allModels = parseModelList(process.env.GEMINI_MODEL, DEFAULT_GEMINI_MODELS);

  // Try available models first, or all if all are cooling down
  let modelsToTry = allModels.filter(m => isModelAvailable('gemini', m));
  if (modelsToTry.length === 0) {
    modelsToTry = allModels;
  }

  const errors = [];

  for (const model of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192,
        },
      };

      const headers = { 'Content-Type': 'application/json' };
      const resStr = await httpPost(url, JSON.stringify(payload), headers);
      const data = JSON.parse(resStr);

      if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
        const usageMeta = data.usageMetadata || {};
        const text = data.candidates[0].content.parts[0].text.trim();

        const estimatedInput = estimateTokens(prompt);
        const estimatedOutput = estimateTokens(text);

        return {
          text: text,
          model: model,
          usage: {
            input_tokens: usageMeta.promptTokenCount ?? estimatedInput,
            output_tokens: usageMeta.candidatesTokenCount ?? estimatedOutput,
            total_tokens: usageMeta.totalTokenCount ?? estimatedInput + estimatedOutput,
            source: usageMeta.totalTokenCount != null ? 'provider_reported' : 'estimated',
          },
        };
      }
      throw new Error(`Unexpected Gemini response: ${resStr.slice(0, 200)}`);
    } catch (err) {
      if (/rate limit|429|quota/i.test(err.message)) {
        setModelCooldown('gemini', model, 60000);
      } else if (/404|not found|deprecated/i.test(err.message)) {
        setModelCooldown('gemini', model, 24 * 60 * 60 * 1000);
      } else if (/503|unavailable|overloaded/i.test(err.message)) {
        setModelCooldown('gemini', model, 30000);
      }

      console.warn(
        `[CodeLens] Gemini model '${model}' failed: ${err.message}. Trying next available fallback model...`
      );
      errors.push(`${model}: ${err.message}`);
    }
  }

  throw new Error(`All Gemini models failed: ${errors.join('; ')}`);
}

// ── OpenAI-Compatible provider ────────────────────────────────────────────────

async function openAiCompatibleProvider(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  const url = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions';
  const models = parseModelList(process.env.OPENAI_MODEL, ['gpt-3.5-turbo']);
  const errors = [];

  for (const model of models) {
    try {
      const payload = {
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 4096,
      };

      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      };

      const resStr = await httpPost(url, JSON.stringify(payload), headers);
      const data = JSON.parse(resStr);

      if (data.choices && data.choices[0]?.message?.content) {
        const usage = data.usage || {};
        const text = data.choices[0].message.content.trim();

        const estimatedInput = estimateTokens(prompt);
        const estimatedOutput = estimateTokens(text);

        return {
          text: text,
          usage: {
            input_tokens: usage.prompt_tokens ?? estimatedInput,
            output_tokens: usage.completion_tokens ?? estimatedOutput,
            total_tokens: usage.total_tokens ?? estimatedInput + estimatedOutput,
            source: usage.total_tokens != null ? 'provider_reported' : 'estimated',
          },
        };
      }
      throw new Error(`Unexpected OpenAI-compatible response: ${resStr.slice(0, 200)}`);
    } catch (err) {
      console.warn(
        `[CodeLens] OpenAI-compatible model '${model}' failed: ${err.message}. Trying next fallback model...`
      );
      errors.push(`${model}: ${err.message}`);
    }
  }

  throw new Error(`All OpenAI-compatible models failed: ${errors.join('; ')}`);
}

// ── Groq provider ─────────────────────────────────────────────────────────────

async function groqProvider(prompt) {
  const apiKey = process.env.GROQ_API_KEY;
  const url = process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions';
  const allModels = parseModelList(process.env.GROQ_MODEL, DEFAULT_GROQ_MODELS);

  // Try available models first, or all if all are cooling down
  let modelsToTry = allModels.filter(m => isModelAvailable('groq', m));
  if (modelsToTry.length === 0) {
    modelsToTry = allModels;
  }

  const errors = [];

  for (const model of modelsToTry) {
    try {
      // Set model-specific max_tokens to respect individual model OTPM and context limits
      let maxTokens = 4096;
      if (model.toLowerCase().includes('qwen')) {
        maxTokens = 800; // Qwen on-demand has strict 1,000 OTPM
      } else if (model.toLowerCase().includes('3.2-3b')) {
        maxTokens = 2048;
      }

      const payload = {
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: maxTokens,
      };

      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      };

      const resStr = await httpPost(url, JSON.stringify(payload), headers);
      const data = JSON.parse(resStr);

      if (data.choices && data.choices[0]?.message?.content) {
        const usage = data.usage || {};
        const text = data.choices[0].message.content.trim();

        const estimatedInput = estimateTokens(prompt);
        const estimatedOutput = estimateTokens(text);

        return {
          text: text,
          model: model,
          usage: {
            input_tokens: usage.prompt_tokens ?? estimatedInput,
            output_tokens: usage.completion_tokens ?? estimatedOutput,
            total_tokens: usage.total_tokens ?? estimatedInput + estimatedOutput,
            source: usage.total_tokens != null ? 'provider_reported' : 'estimated',
          },
        };
      }
      throw new Error(`Unexpected Groq response: ${resStr.slice(0, 200)}`);
    } catch (err) {
      if (/rate limit|429|quota|OTPM|TPM/i.test(err.message)) {
        setModelCooldown('groq', model, 60000);
      } else if (/404|not found|deprecated|decommissioned/i.test(err.message)) {
        setModelCooldown('groq', model, 24 * 60 * 60 * 1000);
      } else if (/503|unavailable|overloaded/i.test(err.message)) {
        setModelCooldown('groq', model, 30000);
      }

      console.warn(`[CodeLens] Groq model '${model}' failed: ${err.message}. Trying next available fallback model...`);
      errors.push(`${model}: ${err.message}`);
    }
  }

  throw new Error(`All Groq models failed: ${errors.join('; ')}`);
}

// ── Provider registry (ordered fallback chain) ───────────────────────────────

/**
 * Build an ordered list of all currently configured providers.
 * Priority: Generic LLM → Google Gemini → OpenAI-Compatible
 *
 * @returns {Array<{name: string, fn: function}>}
 */
function getConfiguredProviders() {
  const providers = [];
  if (process.env.LLM_API_KEY && process.env.LLM_PROJECT_ID) {
    providers.push({ name: 'Generic LLM', fn: genericLlmProvider });
  }
  if (process.env.GROQ_API_KEY) {
    providers.push({ name: 'Groq', fn: groqProvider });
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
      'No AI provider is configured. Set GROQ_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY, or LLM_API_KEY + LLM_PROJECT_ID in your .env file.'
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

  throw new ProviderUnavailableError(`All configured AI providers failed.\n${errors.join('\n')}`);
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
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
    };
    const req = https.request(opts, res => {
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

module.exports = {
  generateAnswer,
  isProviderConfigured,
  getProviderName,
  verifyProviderConnection,
  ProviderUnavailableError,
};
