const express = require('express');
const cors = require('cors');

const aiRouter = require('./domains/ai/ai.routes');
const assetsRouter = require('./domains/assets/assets.routes');
const { globalRateLimiter } = require('./core/middleware/rate-limit.middleware');

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
const isProd = process.env.NODE_ENV === 'production';
const allowedOrigins = isProd 
  ? [process.env.FRONTEND_URL].filter(Boolean)
  : ['http://localhost:5173'];

app.use(cors({ 
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }, 
  credentials: true 
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Apply global rate limiting
app.use('/api/', globalRateLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({
    name: 'CodeLens API',
    description: 'AI-Driven Code Intelligence and Automated Documentation System',
    version: '1.0.0',
    docs: 'Available at /api/docs'
  });
});

app.use('/api/ai', aiRouter);
app.use('/api/assets', assetsRouter);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Error handler ─────────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[CodeLens] Unhandled error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

module.exports = app;
