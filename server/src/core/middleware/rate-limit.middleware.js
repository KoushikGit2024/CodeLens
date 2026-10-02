const rateLimit = require('express-rate-limit');

const globalRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // limit each IP to 20 AI requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'AI rate limit exceeded, please slow down.' },
});

module.exports = {
  globalRateLimiter,
  aiRateLimiter,
};
