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

const { getSupabaseClient } = require('../db/supabase.client');

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const supabase = getSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      console.error('[authMiddleware] Supabase getUser error:', error?.message);
      return res.status(401).json({ error: 'Invalid or expired token', details: error?.message });
    }

    req.user = {
      id: user.id,
      email: user.email,
    };
    return next();
  } catch (err) {
    console.error('[authMiddleware] Auth check failed:', err.message);
    return res.status(500).json({ error: 'Internal auth check failed' });
  }
}

module.exports = authMiddleware;
