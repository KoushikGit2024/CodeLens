/**
 * repositoryStore
 *
 * In-memory store for RepositoryRecords, backed by disk via persistenceStore.
 *
 * Shape:
 *   Map<string, RepositoryRecord>
 *
 * RepositoryRecord {
 *   id:              string         — uuid
 *   name:            string         — derived from uploaded filename
 *   uploadedAt:      Date
 *   status:          'pending' | 'analyzing' | 'ready' | 'error'
 *   error?:          string
 *   extractPath:     string         — directory containing extracted files
 *   analysisVersion: number         — monotonic version counter
 *   analysis?:       AnalysisResult — populated after analysis completes
 * }
 *
 * Persistence contract:
 *   - set()    → writes meta.json (and analysis.json if analysis is present)
 *   - update() → patches in memory and re-writes meta.json (+ analysis.json if needed)
 *   - On module load, all previously saved repos are restored from disk.
 */

'use strict';

const persistence = require('./persistence.store');

// ── In-memory map ─────────────────────────────────────────────────────────────
const store = new Map();

// ── Boot: restore repos from disk ────────────────────────────────────────────
const restored = persistence.loadAll();
for (const record of restored) {
  store.set(record.id, record);
}

// ── Public API ────────────────────────────────────────────────────────────────

module.exports = {
  set(id, record) {
    store.set(id, record);
    persistence.save(record);
  },

  get(id) {
    return store.get(id) || null;
  },

  update(id, patch) {
    const existing = store.get(id);
    if (!existing) throw new Error(`Repository ${id} not found in store`);
    const updated = { ...existing, ...patch };
    store.set(id, updated);

    // Write analysis separately (large) only when it changes
    if (patch.analysis) {
      persistence.saveAnalysis(id, patch.analysis);
      // Save meta without analysis to keep meta.json lean
      persistence.saveMeta(updated);
    } else {
      persistence.saveMeta(updated);
    }
  },

  all() {
    return Array.from(store.values());
  },

  remove(id) {
    store.delete(id);
    persistence.remove(id);
  },
};
