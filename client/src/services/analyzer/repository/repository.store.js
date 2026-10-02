/**
 * repository.store.js
 *
 * It manages an in-memory application cache, then extracts disk synchronizations,
 * and then it applies state patches to maintain UI continuity during analysis.
 */

import * as persistence from './persistence.store.js';

const store = new Map();

let initialized = false;
let initPromise = null;

/**
 * It invokes the persistence loader, then extracts saved repository states,
 * and then it applies fail-safes for interrupted processing sessions.
 */
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

/**
 * It proxies the initialization routine, then extracts the completion promise,
 * and then it applies it to boot the local map.
 */
export async function initializeStore() {
  return ensureInitialized();
}

/**
 * It writes to the active memory map, then extracts the payload,
 * and then it applies disk persistence via IndexedDB.
 */
export async function set(id, record) {
  await ensureInitialized();
  store.set(id, record);
  await persistence.save(record);
}

/**
 * It reads directly from IndexedDB, then extracts fresh background updates,
 * and then it applies them to the local memory cache before returning.
 */
export async function get(id) {
  await ensureInitialized();

  const dbRecord = await persistence.load(id);
  if (dbRecord) {
    store.set(id, dbRecord);
    return dbRecord;
  }
  return store.get(id) || null;
}

/**
 * It triggers a full table read, then extracts the active states,
 * and then it applies a bulk mapping to the local store.
 */
export async function getAll() {
  await ensureInitialized();
  const dbRecords = await persistence.loadAll();
  for (const record of dbRecords) {
    store.set(record.id, record);
  }
  return dbRecords;
}

/**
 * It fetches the current state, then extracts partial updates,
 * and then it applies a unified save across memory and disk.
 */
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

/**
 * It maps over the active cache, then extracts the values array,
 * and then it applies a list format for UI tables.
 */
export async function all() {
  await ensureInitialized();
  return Array.from(store.values());
}

/**
 * It locates the targeted repository, then extracts destruction targets,
 * and then it applies a deep wipe of both RAM and disk stores.
 */
export async function remove(id) {
  await ensureInitialized();
  store.delete(id);
  await persistence.remove(id);
}

/**
 * It fetches the existing record, then extracts the analysis key,
 * and then it applies deletion while retaining overarching metadata.
 */
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
