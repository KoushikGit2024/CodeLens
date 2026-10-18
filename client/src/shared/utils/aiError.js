/**
 * aiError.js
 *
 * Sanitizes raw AI provider errors to present clean, user-friendly messages
 * that never leak internal architecture, third-party endpoints, or raw JSON schemas.
 */

export function sanitizeAiError(rawError) {
  if (!rawError) {
    return {
      type: 'unavailable',
      title: 'AI Service Temporarily Unavailable',
      message: 'The AI service is temporarily unavailable. Please try again in a few moments.',
    };
  }

  // Extract error string from Axios response, Error instance, or plain string
  let msg = '';
  if (typeof rawError === 'string') {
    msg = rawError;
  } else if (rawError.response?.data?.error) {
    const apiErr = rawError.response.data.error;
    msg = typeof apiErr === 'string' ? apiErr : apiErr.message || JSON.stringify(apiErr);
  } else if (rawError.message) {
    msg = rawError.message;
  } else {
    msg = String(rawError);
  }

  // Case 1: AI Offline / No provider configured
  if (
    /no ai provider/i.test(msg) ||
    /ai offline/i.test(msg) ||
    /not configured/i.test(msg) ||
    /provider offline/i.test(msg) ||
    /no provider/i.test(msg)
  ) {
    return {
      type: 'offline',
      title: 'AI Offline',
      message:
        'No AI provider is currently configured. Repository facts and deterministic health metrics remain fully available offline.',
    };
  }

  // Case 2: Quota exhausted / Rate limits
  if (
    /quota/i.test(msg) ||
    /rate limit/i.test(msg) ||
    /429/.test(msg) ||
    /limit reached/i.test(msg) ||
    /exceeded your current quota/i.test(msg)
  ) {
    return {
      type: 'quota',
      title: 'AI Limit Reached',
      message:
        'You have reached the AI usage limit for this billing period. Please check your account quota or try again later.',
    };
  }

  // Case 3: Authentication required
  if (/auth/i.test(msg) || /unauthorized/i.test(msg) || /401/.test(msg) || /sign in/i.test(msg) || /jwt/i.test(msg)) {
    return {
      type: 'auth',
      title: 'Sign In Required',
      message: 'You must be signed in to access AI-enhanced features.',
    };
  }

  // Case 4: General provider errors, 404 model errors, 503 high demand, timeouts, JSON dumps
  // Never expose internal provider names (Groq, Gemini, Anthropic), endpoints (api.groq.com), or raw json!
  return {
    type: 'unavailable',
    title: 'AI Service Temporarily Unavailable',
    message:
      'The AI service is temporarily experiencing technical difficulties or high demand. Please try again in a few moments.',
  };
}

/**
 * Returns just the sanitized message string suitable for toast descriptions or alerts.
 */
export function getCleanErrorMessage(rawError) {
  return sanitizeAiError(rawError).message;
}
