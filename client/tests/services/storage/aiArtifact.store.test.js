/**
 * aiArtifact.store.test.js
 *
 * Unit tests for the AI artifact cache (IndexedDB-backed).
 * IndexedDB is provided by the `fake-indexeddb` polyfill configured in vitest.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { aiArtifactStore, buildCacheKey } from '../../../src/services/storage/aiArtifact.store.js';

// ── buildCacheKey ──────────────────────────────────────────────────────────────

describe('buildCacheKey', () => {
  it('produces a consistent key for the same inputs', () => {
    const k1 = buildCacheKey('repo-1', 'module_doc', 'src/app.js');
    const k2 = buildCacheKey('repo-1', 'module_doc', 'src/app.js');
    expect(k1).toBe(k2);
  });

  it('produces different keys for different repos', () => {
    const k1 = buildCacheKey('repo-1', 'module_doc', 'src/app.js');
    const k2 = buildCacheKey('repo-2', 'module_doc', 'src/app.js');
    expect(k1).not.toBe(k2);
  });

  it('produces different keys for different artifact types', () => {
    const k1 = buildCacheKey('repo-1', 'module_doc', 'src/app.js');
    const k2 = buildCacheKey('repo-1', 'adr', 'src/app.js');
    expect(k1).not.toBe(k2);
  });

  it('normalises the context key to lowercase', () => {
    const k1 = buildCacheKey('repo-1', 'module_doc', 'src/App.js');
    const k2 = buildCacheKey('repo-1', 'module_doc', 'src/app.js');
    expect(k1).toBe(k2);
  });
});

// ── cache get / set ────────────────────────────────────────────────────────────

describe('aiArtifactStore', () => {
  const REPO_ID = 'test-repo';
  const KEY = buildCacheKey(REPO_ID, 'module_doc', 'src/app.js');
  const PAYLOAD = { summary: 'Module does X', functions: ['foo', 'bar'] };

  beforeEach(async () => {
    // Clean up any residual entry from previous test
    await aiArtifactStore.invalidate(KEY);
  });

  it('returns null when the cache is empty', async () => {
    const result = await aiArtifactStore.get(KEY);
    expect(result).toBeNull();
  });

  it('stores and retrieves an artifact', async () => {
    await aiArtifactStore.set(KEY, PAYLOAD, { analysisVersion: 2 });
    const result = await aiArtifactStore.get(KEY, 2);
    expect(result).toEqual(PAYLOAD);
  });

  it('returns null and evicts the entry when analysisVersion differs', async () => {
    await aiArtifactStore.set(KEY, PAYLOAD, { analysisVersion: 1 });
    const result = await aiArtifactStore.get(KEY, 2); // version mismatch
    expect(result).toBeNull();
  });

  it('returns cached data when no analysisVersion is provided to get()', async () => {
    await aiArtifactStore.set(KEY, PAYLOAD, { analysisVersion: 1 });
    const result = await aiArtifactStore.get(KEY); // no version check
    expect(result).toEqual(PAYLOAD);
  });

  it('explicitly invalidates an entry', async () => {
    await aiArtifactStore.set(KEY, PAYLOAD);
    await aiArtifactStore.invalidate(KEY);
    const result = await aiArtifactStore.get(KEY);
    expect(result).toBeNull();
  });

  it('invalidateRepo removes all keys for a repo', async () => {
    const k1 = buildCacheKey(REPO_ID, 'module_doc', 'src/a.js');
    const k2 = buildCacheKey(REPO_ID, 'adr', 'finding-title');
    const kOther = buildCacheKey('other-repo', 'module_doc', 'src/a.js');

    await aiArtifactStore.set(k1, { data: 1 });
    await aiArtifactStore.set(k2, { data: 2 });
    await aiArtifactStore.set(kOther, { data: 3 });

    await aiArtifactStore.invalidateRepo(REPO_ID);

    expect(await aiArtifactStore.get(k1)).toBeNull();
    expect(await aiArtifactStore.get(k2)).toBeNull();
    // Other repo's entry must be untouched
    expect(await aiArtifactStore.get(kOther)).toEqual({ data: 3 });

    // Cleanup
    await aiArtifactStore.invalidate(kOther);
  });
});
