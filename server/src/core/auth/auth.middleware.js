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

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    console.error('[authMiddleware] SUPABASE_JWT_SECRET is not set.');
    return res.status(500).json({ error: 'Server auth misconfigured' });
  }

  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    req.user = {
      id: payload.sub,
      email: payload.email,
    };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = authMiddleware;
