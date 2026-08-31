/**
 * ai.service.js
 *
 * The central orchestration layer for all AI interactions in CodeLens.
 * Handles timeouts, retries, JSON parsing, basic schema validation,
 * and offline fallback behavior.
 */

'use strict';

const { generateAnswer, isProviderConfigured } = require('./ai.provider');

// ── Configuration ─────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = parseInt(process.env.AI_TIMEOUT_MS || '45000', 10);
const DEFAULT_MAX_RETRIES = parseInt(process.env.AI_MAX_RETRIES || '2', 10);

// ── Core Service Methods ──────────────────────────────────────────────────────

/**
 * Checks if an AI provider is configured and available.
 */
function isAIAvailable() {
  return isProviderConfigured();
}

/**
 * Generates a structured JSON response from the AI provider.
 * Enforces timeout, extracts JSON from markdown, and handles retries.
 * 
 * @param {string} prompt The full prompt string
 * @param {object} schema Optional JSON schema for validation
 * @param {object} options Override timeout, retries, etc.
 * @returns {Promise<object>} The parsed and validated JSON object
 */
async function generateStructuredResponse(prompt, schema = null, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  
  // Ask the model to reply in JSON
  const schemaInstruction = schema 
    ? `\n\nReturn your response as raw, valid JSON matching this schema:\n${JSON.stringify(schema, null, 2)}\nDo not include markdown blocks, just the JSON.` 
    : `\n\nReturn your response as raw, valid JSON.`;
    
  const finalPrompt = prompt + schemaInstruction;

  let attempt = 0;
  let lastError = null;

  while (attempt <= maxRetries) {
    attempt++;
    try {
      // Execute with timeout
      const responseText = await executeWithTimeout(
        () => generateAnswer(finalPrompt), 
        timeoutMs
      );
      
      // Parse JSON
      const json = extractAndParseJSON(responseText);
      
      // Validate schema if provided
      if (schema) {
        validateBasicSchema(json, schema);
      }
      
      return json;
      
    } catch (error) {
      lastError = error;
      console.warn(`[aiService] Attempt ${attempt}/${maxRetries + 1} failed: ${error.message}`);
      
      // Do not retry if provider is completely unavailable or authentication failed (e.g. 401/403)
      if (error.statusCode === 503 || error.message.includes('401') || error.message.includes('403')) {
        break; 
      }
      
      // Wait a bit before retrying
      if (attempt <= maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
  }

  throw new Error(`AI generation failed after ${maxRetries + 1} attempts. Last error: ${lastError.message}`);
}

// ── Utility Functions ─────────────────────────────────────────────────────────

async function executeWithTimeout(asyncFn, timeoutMs) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`AI request timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  
  try {
    return await Promise.race([asyncFn(), timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractAndParseJSON(rawText) {
  let text = rawText.trim();
  
  // Strip markdown code blocks
  if (text.startsWith('```json')) {
    text = text.replace(/^```json\s*/, '');
  } else if (text.startsWith('```')) {
    text = text.replace(/^```\s*/, '');
  }
  if (text.endsWith('```')) {
    text = text.replace(/\s*```$/, '');
  }
  
  // Attempt to parse
  try {
    return JSON.parse(text);
  } catch (error) {
    // If it fails, try to aggressively extract the JSON object/array
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    const firstBracket = text.indexOf('[');
    const lastBracket = text.lastIndexOf(']');
    
    let extracted = text;
    if (firstBrace >= 0 && lastBrace >= 0 && (firstBracket === -1 || firstBrace < firstBracket)) {
      extracted = text.substring(firstBrace, lastBrace + 1);
    } else if (firstBracket >= 0 && lastBracket >= 0) {
      extracted = text.substring(firstBracket, lastBracket + 1);
    }
    
    try {
      return JSON.parse(extracted);
    } catch (fallbackError) {
      throw new Error(`Failed to parse AI JSON response: ${error.message}. Response was: ${text.slice(0, 200)}...`);
    }
  }
}

/**
 * Extremely basic JSON schema validation.
 * Checks required fields.
 */
function validateBasicSchema(data, schema) {
  if (!data || typeof data !== 'object') {
    throw new Error('AI response is not a JSON object/array');
  }
  
  if (schema.required && Array.isArray(schema.required)) {
    for (const field of schema.required) {
      if (data[field] === undefined) {
        throw new Error(`Missing required field in AI response: ${field}`);
      }
    }
  }
}

/**
 * Generates a plain text response from the AI provider.
 * Enforces timeout and handles retries.
 */
async function generateAnswerService(prompt, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  
  let attempt = 0;
  let lastError = null;

  while (attempt <= maxRetries) {
    attempt++;
    try {
      return await executeWithTimeout(
        () => generateAnswer(prompt), 
        timeoutMs
      );
    } catch (error) {
      lastError = error;
      console.warn(`[aiService] Plain answer attempt ${attempt}/${maxRetries + 1} failed: ${error.message}`);
      
      if (error.statusCode === 503 || error.message.includes('401') || error.message.includes('403')) {
        break; 
      }
      if (attempt <= maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
  }

  throw new Error(`AI generation failed after ${maxRetries + 1} attempts. Last error: ${lastError.message}`);
}

module.exports = {
  isAIAvailable,
  generateStructuredResponse,
  generateAnswer: generateAnswerService
};
