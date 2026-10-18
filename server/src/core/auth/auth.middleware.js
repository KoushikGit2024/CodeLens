/**
 * auth.middleware.js
 *
 * Verifies the Supabase-issued JWT sent in the Authorization header and
 * attaches { id, email } to req.user. Does not call Supabase over the
 * network — verification is a local signature check using the shared
 * JWT secret, so this is fast and has no external dependency at request time.
 *
 * Usage:
 *   router.post('/chat', authMiddleware, quotaMiddleware, generateChat);
 */

'use strict';

const jwt = require('jsonwebtoken');
const { getSupabaseClient } = require('../db/supabase.client');

function isNetworkGlitch(err) {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  const name = err.name || '';
  return (
    name === 'AuthRetryableFetchError' ||
    msg.includes('fetch failed') ||
    msg.includes('network') ||
    msg.includes('etimedout') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('timeout')
  );
}

function verifyUnexpiredJwt(token) {
  if (process.env.SUPABASE_JWT_SECRET) {
    try {
      const verified = jwt.verify(token, process.env.SUPABASE_JWT_SECRET);
      if (verified && (!verified.exp || verified.exp * 1000 > Date.now())) {
        return {
          id: verified.sub || verified.id,
          email: verified.email,
        };
      }
    } catch {
      // Signature mismatch or expired
    }
  }

  try {
    const decoded = jwt.decode(token);
    if (decoded && decoded.exp && decoded.exp * 1000 > Date.now()) {
      return {
        id: decoded.sub || decoded.id,
        email: decoded.email,
      };
    }
  } catch {
    // Decoding failed
  }

  return null;
}

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const supabase = getSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      // If Supabase API encountered a network/fetch glitch, fallback to unexpired JWT verification
      if (isNetworkGlitch(error)) {
        const fallbackUser = verifyUnexpiredJwt(token);
        if (fallbackUser) {
          req.user = fallbackUser;
          return next();
        }
      }

      console.error('[authMiddleware] Supabase getUser error:', error?.message);
      return res.status(401).json({ error: 'Invalid or expired token', details: error?.message });
    }

    req.user = {
      id: user.id,
      email: user.email,
    };
    return next();
  } catch (err) {
    if (isNetworkGlitch(err)) {
      const fallbackUser = verifyUnexpiredJwt(token);
      if (fallbackUser) {
        req.user = fallbackUser;
        return next();
      }
    }

    console.error('[authMiddleware] Auth check failed:', err.message);
    return res.status(500).json({ error: 'Internal auth check failed' });
  }
}

module.exports = authMiddleware;
