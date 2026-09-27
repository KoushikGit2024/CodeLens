/**
 * aiArtifact.store.js
 *
 * Quota-aware caching for deterministic AI-generated artifacts:
 *   - Module Documentation
 *   - ADR drafts
 *
 * Cache key is built from:
 *   repoId + artifactType + path/context + analysisVersion + promptVersion
 *
 * Validation:
 *   If the repository's analysisVersion has changed since the artifact was
 *   cached, the cache entry is treated as stale and re-generation is triggered.
 *
 * Usage:
 *   import { aiArtifactStore } from '../storage/aiArtifact.store';
 *
 *   const cached = await aiArtifactStore.get(key);
 *   if (cached) return cached;
 *
 *   const result = await expensiveAiCall();
 *   await aiArtifactStore.set(key, result, { analysisVersion });
 *   return result;
 */

import { getDB } from '../analyzer/repository/persistence.store.js';

/** Increment when the prompt / output schema changes to bust all caches. */
const PROMPT_VERSION = 1;

/**
 * Build a deterministic, human-readable cache key.
 *
 * @param {string}  repoId
 * @param {string}  artifactType   e.g. 'module_doc' | 'adr'
 * @param {string}  contextKey     e.g. the file path or finding ID
 * @returns {string}
 */
export function buildCacheKey(repoId, artifactType, contextKey) {
  const normalized = (contextKey || '').replace(/\\/g, '/').toLowerCase();
  return `${repoId}::${artifactType}::${normalized}::pv${PROMPT_VERSION}`;
}

export const aiArtifactStore = {
  /**
   * Retrieve a cached artifact.
   * Returns null when:
   *   - No entry exists
   *   - The analysisVersion stored with the entry differs from `currentAnalysisVersion`
   *
   * @param {string}  cacheKey
   * @param {number | string | undefined} currentAnalysisVersion
   * @returns {Promise<object|null>}
   */
  async get(cacheKey, currentAnalysisVersion) {
    try {
      const db = await getDB();
      const entry = await db.get('aiArtifacts', cacheKey);
      if (!entry) return null;

      // Stale-check: if caller provides a version and it differs, discard
      if (
        currentAnalysisVersion != null &&
        entry.analysisVersion != null &&
        String(entry.analysisVersion) !== String(currentAnalysisVersion)
      ) {
        // Asynchronously evict the stale entry (fire-and-forget)
        db.delete('aiArtifacts', cacheKey).catch(() => {});
        return null;
      }

      return entry.data;
    } catch (err) {
      console.warn('[aiArtifactStore] get failed (non-fatal):', err.message);
      return null;
    }
  },

  /**
   * Persist a generated artifact.
   *
   * @param {string}  cacheKey
   * @param {object}  data              The artifact payload to cache
   * @param {object}  [opts]
   * @param {number | string} [opts.analysisVersion]   Stored for stale-checking
   * @returns {Promise<void>}
   */
  async set(cacheKey, data, opts = {}) {
    try {
      const db = await getDB();
      await db.put('aiArtifacts', {
        cacheKey,
        data,
        analysisVersion: opts.analysisVersion ?? null,
        cachedAt: Date.now(),
      });
    } catch (err) {
      console.warn('[aiArtifactStore] set failed (non-fatal):', err.message);
    }
  },

  /**
   * Explicitly evict a single cache entry.
   * @param {string} cacheKey
   */
  async invalidate(cacheKey) {
    try {
      const db = await getDB();
      await db.delete('aiArtifacts', cacheKey);
    } catch (err) {
      console.warn('[aiArtifactStore] invalidate failed (non-fatal):', err.message);
    }
  },

  /**
   * Evict all cached artifacts for a specific repository.
   * Call this when the repository is re-analyzed or deleted.
   * @param {string} repoId
   */
  async invalidateRepo(repoId) {
    try {
      const db = await getDB();
      const tx = db.transaction('aiArtifacts', 'readwrite');
      const store = tx.objectStore('aiArtifacts');
      let cursor = await store.openCursor();
      while (cursor) {
        if (cursor.key.startsWith(`${repoId}::`)) {
          await cursor.delete();
        }
        cursor = await cursor.continue();
      }
      await tx.done;
    } catch (err) {
      console.warn('[aiArtifactStore] invalidateRepo failed (non-fatal):', err.message);
    }
  },
};
