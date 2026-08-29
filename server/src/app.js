const express = require('express');
const cors = require('cors');

const healthRouter = require('./routes/health');
const repositoryRouter = require('./routes/repository');
const docsRouter = require('./routes/docs');

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({
    name: 'CodeLens API',
    description: 'AI-Driven Code Intelligence and Automated Documentation System',
    version: '1.0.0',
    docs: 'Available at /api/docs'
  });
});

app.use('/api/health', healthRouter);
app.use('/api/repository', repositoryRouter);
app.use('/api/docs', docsRouter);

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
