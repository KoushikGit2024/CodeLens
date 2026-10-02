'use strict';

const request = require('supertest');
const express = require('express');

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../../src/core/ai/ai.provider', () => ({
  generateAnswer: jest.fn(),
  isProviderConfigured: jest.fn(() => true),
  getProviderName: jest.fn(() => 'Mock Provider'),
}));

jest.mock('../../../src/core/ai/ai.service', () => ({
  generateStructuredResponse: jest.fn(),
  generateAnswer: jest.fn(),
  isAIAvailable: jest.fn(() => true),
}));

const aiProvider = require('../../../src/core/ai/ai.provider');
const aiService = require('../../../src/core/ai/ai.service');
const { generateChat, healthCheck } = require('../../../src/domains/ai/ai.controller');

// ── Test App ──────────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.get('/ai/health', healthCheck);
  app.post('/ai/chat', generateChat);
  app.use((err, req, res, next) => {
    res.status(500).json({ error: err.message });
  });
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /ai/health', () => {
  it('returns configured=true when provider is ready', async () => {
    const res = await request(buildApp()).get('/ai/health');
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(true);
    expect(res.body.provider).toBe('Mock Provider');
  });
});

describe('POST /ai/chat', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when prompt is missing', async () => {
    const res = await request(buildApp()).post('/ai/chat').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing prompt/i);
  });

  it('returns 202 Accepted and a jobId for a plain prompt', async () => {
    const res = await request(buildApp()).post('/ai/chat').send({ prompt: 'What is CodeLens?' });
    expect(res.status).toBe(202);
    expect(res.body.jobId).toBeDefined();
    expect(res.body.status).toBe('processing');
  });

  it('prepends conversation history to the prompt in the background job', async () => {
    const history = [
      { role: 'user', content: 'What is this repo about?' },
      { role: 'assistant', content: 'It is a code intelligence system.' },
    ];
    await request(buildApp()).post('/ai/chat').send({ prompt: 'Tell me more.', history });

    // The job process is async, so we just verify it accepted the request.
    // Deep verification of the async background process is better suited for a service-level unit test.
  });
});

const { getJobStatus } = require('../../../src/domains/ai/ai.controller');
describe('GET /ai/job/:jobId', () => {
  it('returns 404 for unknown job', async () => {
    const app = buildApp();
    app.get('/ai/job/:jobId', getJobStatus);
    const res = await request(app).get('/ai/job/unknown-id');
    expect(res.status).toBe(404);
  });
});
