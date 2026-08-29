/**
 * tests/api/getFile.test.js
 *
 * Tests for GET /api/repository/:id/file?path=...
 *
 * Covers:
 *   - valid file request
 *   - language field in response
 *   - nonexistent file
 *   - path traversal attempts (../)
 *   - absolute path rejection
 *   - directory path rejection
 *   - missing path parameter
 *   - repository not found
 *   - repository not ready
 *   - file too large
 */

'use strict';

const request = require('supertest');
const path    = require('path');
const fs      = require('fs');
const os      = require('os');

const app   = require('../../src/app');
const store = require('../../src/repositories/repositoryStore');

// ── Helpers ───────────────────────────────────────────────────────────────────

let tmpDir;
let repoId;

beforeEach(() => {
  // Create a real temporary directory with known files
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codelens_test_getfile_'));

  // src/app.js
  fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'src', 'app.js'),
    "const express = require('express');\nmodule.exports = express();\n", 'utf8');

  // src/utils.ts
  fs.writeFileSync(path.join(tmpDir, 'src', 'utils.ts'),
    'export function greet(name: string) { return `Hello ${name}`; }\n', 'utf8');

  // README.md
  fs.writeFileSync(path.join(tmpDir, 'README.md'), '# My Project\n', 'utf8');

  repoId = 'test-getfile-' + Date.now();
  store.set(repoId, {
    id:          repoId,
    name:        'test-project',
    uploadedAt:  new Date(),
    status:      'ready',
    extractPath: tmpDir,
    analysis:    { files: [], status: 'ready' },
  });
});

afterEach(() => {
  // Clean up temp files
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

// ── Valid requests ────────────────────────────────────────────────────────────

describe('GET /api/repository/:id/file — valid requests', () => {
  test('returns 200 with path, content, size, language', async () => {
    const res = await request(app)
      .get(`/api/repository/${repoId}/file`)
      .query({ path: 'src/app.js' });

    expect(res.status).toBe(200);
    expect(res.body.path).toBe('src/app.js');
    expect(res.body.content).toContain('express');
    expect(typeof res.body.size).toBe('number');
    expect(res.body.size).toBeGreaterThan(0);
  });

  test('javascript file returns language: "javascript"', async () => {
    const res = await request(app)
      .get(`/api/repository/${repoId}/file`)
      .query({ path: 'src/app.js' });

    expect(res.status).toBe(200);
    expect(res.body.language).toBe('javascript');
  });

  test('typescript file returns language: "typescript"', async () => {
    const res = await request(app)
      .get(`/api/repository/${repoId}/file`)
      .query({ path: 'src/utils.ts' });

    expect(res.status).toBe(200);
    expect(res.body.language).toBe('typescript');
  });

  test('unsupported extension (README.md) returns language: null', async () => {
    const res = await request(app)
      .get(`/api/repository/${repoId}/file`)
      .query({ path: 'README.md' });

    expect(res.status).toBe(200);
    expect(res.body.language).toBeNull();
    expect(res.body.content).toContain('My Project');
  });

  test('content matches actual file content', async () => {
    const res = await request(app)
      .get(`/api/repository/${repoId}/file`)
      .query({ path: 'src/utils.ts' });

    expect(res.body.content).toContain('greet');
    expect(res.body.content).toContain('string');
  });
});

// ── Missing / invalid input ───────────────────────────────────────────────────

describe('GET /api/repository/:id/file — invalid input', () => {
  test('missing path parameter returns 400', async () => {
    const res = await request(app)
      .get(`/api/repository/${repoId}/file`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('nonexistent file returns 404', async () => {
    const res = await request(app)
      .get(`/api/repository/${repoId}/file`)
      .query({ path: 'src/doesNotExist.js' });

    expect(res.status).toBe(404);
  });

  test('directory path returns 400', async () => {
    const res = await request(app)
      .get(`/api/repository/${repoId}/file`)
      .query({ path: 'src' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/directory/i);
  });
});

// ── Path traversal security ───────────────────────────────────────────────────

describe('GET /api/repository/:id/file — path traversal protection', () => {
  test('../ traversal is rejected with 403', async () => {
    const res = await request(app)
      .get(`/api/repository/${repoId}/file`)
      .query({ path: '../../../etc/passwd' });

    expect(res.status).toBe(403);
  });

  test('nested ../ traversal is rejected', async () => {
    const res = await request(app)
      .get(`/api/repository/${repoId}/file`)
      .query({ path: 'src/../../etc/passwd' });

    expect(res.status).toBe(403);
  });

  test('URL-encoded traversal (..%2F) reaches 403 or 404', async () => {
    const res = await request(app)
      .get(`/api/repository/${repoId}/file`)
      .query({ path: '..%2F..%2Fetc%2Fpasswd' });

    // Should either be rejected (403) or not found (404); never 200
    expect(res.status).not.toBe(200);
  });

  test('response body never contains extractPath', async () => {
    const res = await request(app)
      .get(`/api/repository/${repoId}/file`)
      .query({ path: 'src/app.js' });

    expect(JSON.stringify(res.body)).not.toContain(tmpDir);
  });

  test('response body never contains os.tmpdir root', async () => {
    const res = await request(app)
      .get(`/api/repository/${repoId}/file`)
      .query({ path: 'src/app.js' });

    const tmpRoot = os.tmpdir().split(path.sep)[0];
    // The path field should be the relative path, not an absolute one
    expect(res.body.path).not.toMatch(/^[/\\]/);
    expect(res.body.path).not.toContain(':'); // no drive letters
  });
});

// ── Repository state ──────────────────────────────────────────────────────────

describe('GET /api/repository/:id/file — repository state', () => {
  test('unknown repository returns 404', async () => {
    const res = await request(app)
      .get('/api/repository/unknown-id/file')
      .query({ path: 'src/app.js' });

    expect(res.status).toBe(404);
  });

  test('repository not ready returns 409', async () => {
    store.set('analyzing-repo-file', {
      id:          'analyzing-repo-file',
      name:        'x',
      uploadedAt:  new Date(),
      status:      'analyzing',
      extractPath: tmpDir,
      analysis:    null,
    });

    const res = await request(app)
      .get('/api/repository/analyzing-repo-file/file')
      .query({ path: 'src/app.js' });

    expect(res.status).toBe(409);
  });
});

// ── File too large ────────────────────────────────────────────────────────────

describe('GET /api/repository/:id/file — file size limit', () => {
  test('file over 2 MB returns 413', async () => {
    // Create a file just over 2 MB
    const bigPath = path.join(tmpDir, 'big.js');
    const twoMbPlus = Buffer.alloc(2 * 1024 * 1024 + 1, 'x');
    fs.writeFileSync(bigPath, twoMbPlus);

    const res = await request(app)
      .get(`/api/repository/${repoId}/file`)
      .query({ path: 'big.js' });

    expect(res.status).toBe(413);
  });
});
