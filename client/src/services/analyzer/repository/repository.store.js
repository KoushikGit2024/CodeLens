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
 *   chats:           Record<string, Array> — all chat histories
 * }
 *
 * Persistence contract:
 *   - set()    → writes meta.json (and analysis.json if analysis is present)
 *   - update() → patches in memory and re-writes meta.json (+ analysis.json if needed)
 *   - On module load, all previously saved repos are restored from disk.
 */

import * as persistence from './persistence.store.js';

// ── In-memory map ─────────────────────────────────────────────────────────────
const store = new Map();

let initialized = false;
let initPromise = null;

async function ensureInitialized() {
  if (initialized) return;
  if (!initPromise) {
    initPromise = (async () => {
      const restored = await persistence.loadAll();
      for (const record of restored) {
        if (record.status === 'analyzing' || record.status === 'pending') {
          record.status = 'error';
          record.error = 'Analysis was interrupted by a page reload.';
          await persistence.saveMeta(record);
        }
        store.set(record.id, record);
      }
      initialized = true;
    })();
  }
  return initPromise;
}

// ── Boot: restore repos from disk ────────────────────────────────────────────
export async function initializeStore() {
  return ensureInitialized();
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function set(id, record) {
  await ensureInitialized();
  store.set(id, record);
  await persistence.save(record);
}

export async function get(id) {
  await ensureInitialized();
  
  // ALWAYS read from IndexedDB to ensure we aren't reading stale UI-thread memory
  // that missed background worker updates.
  const dbRecord = await persistence.load(id);
  if (dbRecord) {
    store.set(id, dbRecord); // Update local cache
    return dbRecord;
  }
  return store.get(id) || null;
}

export async function getAll() {
  await ensureInitialized();
  const dbRecords = await persistence.loadAll();
  for (const record of dbRecords) {
    store.set(record.id, record);
  }
  return dbRecords;
}

export async function update(id, patch) {
  await ensureInitialized();
  const existing = store.get(id);
  if (!existing) throw new Error(`Repository ${id} not found in store`);
  const updated = { ...existing, ...patch };
  store.set(id, updated);
  
  if (patch.analysis) {
    await persistence.saveAnalysis(updated);
  }
  await persistence.saveMeta(updated);
}

export async function all() {
  await ensureInitialized();
  return Array.from(store.values());
}

export async function remove(id) {
  await ensureInitialized();
  store.delete(id);
  await persistence.remove(id);
}

export async function clearAnalysis(id) {
  await ensureInitialized();
  const existing = store.get(id);
  if (!existing) return;
  
  delete existing.analysis;
  existing.status = 'unanalyzed';
  existing.phase = 'uploading';
  existing.phaseDetails = null;
  
  store.set(id, existing);
  await persistence.saveMeta(existing);
  await persistence.removeAnalysis(id);
}
