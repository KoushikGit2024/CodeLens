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
const aiService  = require('../../../src/core/ai/ai.service');
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

  it('returns AI response for a plain prompt', async () => {
    aiProvider.generateAnswer.mockResolvedValue('Hello from AI');
    const res = await request(buildApp())
      .post('/ai/chat')
      .send({ prompt: 'What is CodeLens?' });
    expect(res.status).toBe(200);
    expect(res.body.response).toBe('Hello from AI');
    expect(aiProvider.generateAnswer).toHaveBeenCalledTimes(1);
    // Service should NOT be called for plain prompts
    expect(aiService.generateStructuredResponse).not.toHaveBeenCalled();
  });

  it('prepends conversation history to the prompt', async () => {
    aiProvider.generateAnswer.mockResolvedValue('Follow-up answer');
    const history = [
      { role: 'user', content: 'What is this repo about?' },
      { role: 'assistant', content: 'It is a code intelligence system.' },
    ];
    await request(buildApp())
      .post('/ai/chat')
      .send({ prompt: 'Tell me more.', history });

    const calledWith = aiProvider.generateAnswer.mock.calls[0][0];
    expect(calledWith).toContain('Conversation so far:');
    expect(calledWith).toContain('User: What is this repo about?');
    expect(calledWith).toContain('Assistant: It is a code intelligence system.');
    expect(calledWith).toContain('Tell me more.');
  });

  it('routes jsonMode requests through aiService.generateStructuredResponse', async () => {
    aiService.generateStructuredResponse.mockResolvedValue({ summary: 'test' });
    const res = await request(buildApp())
      .post('/ai/chat')
      .send({ prompt: 'Give me JSON.', jsonMode: true });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body.response)).toEqual({ summary: 'test' });
    expect(aiService.generateStructuredResponse).toHaveBeenCalledTimes(1);
    expect(aiProvider.generateAnswer).not.toHaveBeenCalled();
  });

  it('returns 503 when provider is unavailable', async () => {
    const err = new Error('No AI provider configured');
    err.name = 'ProviderUnavailableError';
    aiProvider.generateAnswer.mockRejectedValue(err);
    const res = await request(buildApp())
      .post('/ai/chat')
      .send({ prompt: 'Hello' });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/no ai provider/i);
  });
});
