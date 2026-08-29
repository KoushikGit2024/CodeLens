/**
 * tests/ai/askEndpoint.test.js
 *
 * Tests for POST /api/repository/:id/ask
 *
 * The AI provider is mocked — no real API calls are made.
 * The repository store is populated with synthetic records.
 */

'use strict';

// ── Mock the AI provider before any requires ──────────────────────────────────

jest.mock('../../src/ai/aiProvider', () => ({
  generateAnswer:       jest.fn(),
  isProviderConfigured: jest.fn(),
  ProviderUnavailableError: class ProviderUnavailableError extends Error {
    constructor(msg) { super(msg); this.name = 'ProviderUnavailableError'; this.statusCode = 503; }
  },
}));

// Mock fs.readFileSync so the context builder doesn't need real files
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    readFileSync: jest.fn((p) => {
      if (p.includes('ENOENT')) throw new Error('ENOENT');
      return `// mock source for ${p.split('/').pop()}\nfunction example() {}\n`;
    }),
  };
});

const request  = require('supertest');
const app      = require('../../src/app');
const store    = require('../../src/repositories/repositoryStore');
const { generateAnswer, isProviderConfigured } = require('../../src/ai/aiProvider');

// ── Supertest helper: install if needed ───────────────────────────────────────
// Supertest is bundled with jest via the project's package or we use http directly.
// If supertest is not installed we'll use a lightweight alternative.

// ── Helpers ───────────────────────────────────────────────────────────────────

let repoId;

function makeAnalysis(fileCount = 2) {
  const files = Array.from({ length: fileCount }, (_, i) => ({
    filePath: `src/file${i}.js`,
    language: 'javascript',
    hasErrors: false,
    error: null,
    symbols: [{ kind: 'function', name: `fn${i}`, location: { startLine: 1, startColumn: 0, endLine: 3, endColumn: 1 } }],
  }));
  return {
    status: 'ready',
    analyzedFiles: fileCount,
    files,
    languageSummary: { javascript: fileCount },
  };
}

beforeEach(() => {
  repoId = 'test-repo-' + Date.now();
  store.set(repoId, {
    id:          repoId,
    name:        'test-project',
    uploadedAt:  new Date(),
    status:      'ready',
    extractPath: '/tmp/fake-extract',
    analysis:    makeAnalysis(3),
  });
  // Default: provider is configured, generates a fixed answer
  isProviderConfigured.mockReturnValue(true);
  generateAnswer.mockResolvedValue(
    'The authentication flow starts in [src/file0.js] and uses [src/file1.js:10-20].'
  );
});

afterEach(() => {
  jest.clearAllMocks();
});

// ── Valid requests ────────────────────────────────────────────────────────────

describe('POST /api/repository/:id/ask — valid requests', () => {
  test('returns 200 with answer, references, and context', async () => {
    const res = await request(app)
      .post(`/api/repository/${repoId}/ask`)
      .send({ question: 'What does this code do?' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('answer');
    expect(res.body).toHaveProperty('references');
    expect(res.body).toHaveProperty('context');
    expect(res.body).toHaveProperty('question', 'What does this code do?');
  });

  test('answer is a non-empty string', async () => {
    const res = await request(app)
      .post(`/api/repository/${repoId}/ask`)
      .send({ question: 'How does auth work?' });

    expect(typeof res.body.answer).toBe('string');
    expect(res.body.answer.length).toBeGreaterThan(0);
  });

  test('references extracts file paths from answer', async () => {
    const res = await request(app)
      .post(`/api/repository/${repoId}/ask`)
      .send({ question: 'How does auth work?' });

    expect(Array.isArray(res.body.references)).toBe(true);
    // Our mock answer contains [src/file0.js]
    const paths = res.body.references.map(r => r.path);
    expect(paths).toContain('src/file0.js');
  });

  test('references includes line info when present', async () => {
    const res = await request(app)
      .post(`/api/repository/${repoId}/ask`)
      .send({ question: 'How does auth work?' });

    const ref = res.body.references.find(r => r.path === 'src/file1.js');
    expect(ref).toBeDefined();
    expect(ref.lines).toBe('10-20');
  });

  test('context metadata contains filesConsidered', async () => {
    const res = await request(app)
      .post(`/api/repository/${repoId}/ask`)
      .send({ question: 'How does auth work?' });

    expect(res.body.context).toHaveProperty('filesConsidered');
    expect(typeof res.body.context.filesConsidered).toBe('number');
  });

  test('context.files contains path and reason', async () => {
    const res = await request(app)
      .post(`/api/repository/${repoId}/ask`)
      .send({ question: 'How does auth work?' });

    expect(Array.isArray(res.body.context.files)).toBe(true);
    if (res.body.context.files.length > 0) {
      expect(res.body.context.files[0]).toHaveProperty('path');
      expect(res.body.context.files[0]).toHaveProperty('reason');
    }
  });

  test('AI provider is called exactly once per request', async () => {
    await request(app)
      .post(`/api/repository/${repoId}/ask`)
      .send({ question: 'test question' });

    expect(generateAnswer).toHaveBeenCalledTimes(1);
  });

  test('whitespace-only question after trim returns 400', async () => {
    const res = await request(app)
      .post(`/api/repository/${repoId}/ask`)
      .send({ question: '   ' });

    expect(res.status).toBe(400);
  });
});

// ── Validation errors ─────────────────────────────────────────────────────────

describe('POST /api/repository/:id/ask — validation', () => {
  test('missing question returns 400', async () => {
    const res = await request(app)
      .post(`/api/repository/${repoId}/ask`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('empty question string returns 400', async () => {
    const res = await request(app)
      .post(`/api/repository/${repoId}/ask`)
      .send({ question: '' });

    expect(res.status).toBe(400);
  });

  test('question over 2000 chars returns 400', async () => {
    const res = await request(app)
      .post(`/api/repository/${repoId}/ask`)
      .send({ question: 'x'.repeat(2001) });

    expect(res.status).toBe(400);
  });
});

// ── Repository state errors ───────────────────────────────────────────────────

describe('POST /api/repository/:id/ask — repository state', () => {
  test('unknown repo id returns 404', async () => {
    const res = await request(app)
      .post('/api/repository/nonexistent-id/ask')
      .send({ question: 'test' });

    expect(res.status).toBe(404);
  });

  test('still-analyzing repository returns 202', async () => {
    store.set('analyzing-repo', {
      id: 'analyzing-repo',
      name: 'x',
      uploadedAt: new Date(),
      status: 'analyzing',
      extractPath: '/tmp/fake',
      analysis: null,
    });

    const res = await request(app)
      .post('/api/repository/analyzing-repo/ask')
      .send({ question: 'test' });

    expect(res.status).toBe(202);
  });

  test('error-status repository returns 409', async () => {
    store.set('error-repo', {
      id: 'error-repo',
      name: 'x',
      uploadedAt: new Date(),
      status: 'error',
      extractPath: '/tmp/fake',
      analysis: null,
    });

    const res = await request(app)
      .post('/api/repository/error-repo/ask')
      .send({ question: 'test' });

    expect(res.status).toBe(409);
  });
});

// ── AI provider errors ────────────────────────────────────────────────────────

describe('POST /api/repository/:id/ask — AI provider errors', () => {
  test('unconfigured provider returns 503', async () => {
    isProviderConfigured.mockReturnValue(false);

    const res = await request(app)
      .post(`/api/repository/${repoId}/ask`)
      .send({ question: 'test question' });

    expect(res.status).toBe(503);
    expect(res.body.configured).toBe(false);
  });

  test('provider call failure returns 502', async () => {
    isProviderConfigured.mockReturnValue(true);
    generateAnswer.mockRejectedValue(new Error('Connection refused'));

    const res = await request(app)
      .post(`/api/repository/${repoId}/ask`)
      .send({ question: 'test question' });

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/AI provider error/);
  });

  test('ProviderUnavailableError returns 503', async () => {
    const { ProviderUnavailableError } = require('../../src/ai/aiProvider');
    isProviderConfigured.mockReturnValue(true);
    generateAnswer.mockRejectedValue(new ProviderUnavailableError('not configured'));

    const res = await request(app)
      .post(`/api/repository/${repoId}/ask`)
      .send({ question: 'test question' });

    expect(res.status).toBe(503);
  });

  test('server does not crash on AI error', async () => {
    isProviderConfigured.mockReturnValue(true);
    generateAnswer.mockRejectedValue(new Error('Unexpected crash'));

    const res = await request(app)
      .post(`/api/repository/${repoId}/ask`)
      .send({ question: 'test' });

    // Should return a structured error, not crash
    expect([502, 503, 500]).toContain(res.status);
    expect(res.body).toHaveProperty('error');
  });
});

// ── Response does not expose internals ────────────────────────────────────────

describe('POST /api/repository/:id/ask — security', () => {
  test('response does not contain extractPath', async () => {
    const res = await request(app)
      .post(`/api/repository/${repoId}/ask`)
      .send({ question: 'test' });

    expect(JSON.stringify(res.body)).not.toContain('/tmp/fake-extract');
  });

  test('response does not contain IBM_API_KEY value', async () => {
    process.env.IBM_API_KEY = 'secret-key-xyz';
    isProviderConfigured.mockReturnValue(true);
    generateAnswer.mockResolvedValue('test answer');

    const res = await request(app)
      .post(`/api/repository/${repoId}/ask`)
      .send({ question: 'test' });

    expect(JSON.stringify(res.body)).not.toContain('secret-key-xyz');
    delete process.env.IBM_API_KEY;
  });
});
