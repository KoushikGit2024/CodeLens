import { describe, it, expect } from 'vitest';
import { sanitizeAiError, getCleanErrorMessage } from '../../../src/shared/utils/aiError.js';

describe('sanitizeAiError', () => {
  it('returns friendly unavailable state for null or empty error', () => {
    const result = sanitizeAiError(null);
    expect(result.type).toBe('unavailable');
    expect(result.title).toBe('AI Service Temporarily Unavailable');
    expect(result.message).toContain('temporarily unavailable');
  });

  describe('Offline case: No AI provider configured', () => {
    it('detects "No AI provider configured" error', () => {
      const result = sanitizeAiError('No AI provider configured.');
      expect(result.type).toBe('offline');
      expect(result.title).toBe('AI Offline');
      expect(result.message).toContain('No AI provider is currently configured');
      expect(result.message).toContain('offline');
    });

    it('detects "AI offline" string', () => {
      const result = sanitizeAiError('AI offline');
      expect(result.type).toBe('offline');
    });

    it('detects provider not configured error in Axios response object', () => {
      const axiosError = {
        response: {
          data: {
            error: 'No provider configured on the server.',
          },
        },
      };
      const result = sanitizeAiError(axiosError);
      expect(result.type).toBe('offline');
      expect(result.title).toBe('AI Offline');
    });
  });

  describe('Sanitizing raw provider dumps and technical details', () => {
    it('completely strips raw 404 model_not_found Groq and Gemini JSON dump', () => {
      const rawTechnicalError =
        'AI generation failed after 3 attempts. Last error: All configured AI providers failed. Groq: HTTP 404 from api.groq.com: {"error":{"message":"The model `llama-3.1-8b-instant` does not exist or you do not have access to it.","type":"invalid_request_error","code":"model_not_found"}} Google Gemini: HTTP 404 from generativelanguage.googleapis.com: { "error": { "code": 404, "message": "models/gemini-1.5-flash is not found for API version v1beta, or is not supported for generateContent. Call ModelService.ListModels to see the list of available models and their supported methods.", "status": "NOT_FOUND" } }';

      const result = sanitizeAiError(rawTechnicalError);
      expect(result.type).toBe('unavailable');
      expect(result.title).toBe('AI Service Temporarily Unavailable');
      // Crucial: Must NEVER leak provider URLs, model names, or internal JSON schemas!
      expect(result.message).not.toContain('groq');
      expect(result.message).not.toContain('gemini');
      expect(result.message).not.toContain('llama-3.1-8b-instant');
      expect(result.message).not.toContain('api.groq.com');
      expect(result.message).not.toContain('generativelanguage.googleapis.com');
      expect(result.message).not.toContain('404');
      expect(result.message).toContain('technical difficulties');
    });

    it('handles generic Error objects without leaking stack traces or internal wording', () => {
      const err = new Error('HTTP 500 Internal Server Error at https://internal.backend/ai');
      const result = sanitizeAiError(err);
      expect(result.type).toBe('unavailable');
      expect(result.message).not.toContain('internal.backend');
    });
  });

  describe('Quota and rate limits', () => {
    it('detects rate limits and quota exhaustion', () => {
      const result = sanitizeAiError('HTTP 429 Too Many Requests: rate limit reached');
      expect(result.type).toBe('quota');
      expect(result.title).toBe('AI Limit Reached');
      expect(result.message).toContain('usage limit');
    });
  });

  describe('Authentication requirements', () => {
    it('detects unauthenticated errors', () => {
      const result = sanitizeAiError('401 Unauthorized: please sign in to continue');
      expect(result.type).toBe('auth');
      expect(result.title).toBe('Sign In Required');
      expect(result.message).toContain('signed in');
    });
  });

  describe('getCleanErrorMessage helper', () => {
    it('returns string message directly', () => {
      const msg = getCleanErrorMessage('No AI provider configured.');
      expect(typeof msg).toBe('string');
      expect(msg).toContain('No AI provider is currently configured');
    });
  });
});
