/**
 * persistenceStore.js
 *
 * Disk-based persistence for repository records.
 *
 * Layout on disk:
 *   server/.data/repos/<id>/
 *     meta.json      — id, name, uploadedAt, status, extractPath
 *     analysis.json  — full RepositoryAnalysis (may be absent if analysis failed)
 *     files/         — extracted ZIP contents (managed by repositoryController)
 *
 * All I/O is synchronous to keep boot simple.  At runtime, writes are async
 * and fire-and-forget (errors are logged but never crash the request).
 */

'use strict';

const path = require('path');
const fs   = require('fs');

// ── Data directory ─────────────────────────────────────────────────────────────
// Placed inside server/ so it is always relative to the project, regardless of
// the working directory the process is started from.
const DATA_DIR  = path.join(__dirname, '..', '..', '.data', 'repos');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ── Public path helper (used by repositoryController) ─────────────────────────

/**
 * Returns the absolute path where extracted files for a repo should live.
 * The directory is created if it does not exist.
 */
function getExtractPath(id) {
  const p = path.join(DATA_DIR, id, 'files');
  ensureDir(p);
  return p;
}

// ── Write helpers ──────────────────────────────────────────────────────────────

/**
 * Persist all non-analysis fields of a record.
 * Safe to call with a partial record that has no analysis yet.
 */
function saveMeta(record) {
  try {
    const dir = path.join(DATA_DIR, record.id);
    ensureDir(dir);
    const { analysis: _a, ...meta } = record;
    fs.writeFileSync(
      path.join(dir, 'meta.json'),
      JSON.stringify(meta, null, 2),
      'utf8'
    );
  } catch (err) {
    console.error('[persistenceStore] Failed to write meta.json:', err.message);
  }
}

/**
 * Persist the analysis object for a repo (may be large).
 */
function saveAnalysis(id, analysis) {
  try {
    const dir = path.join(DATA_DIR, id);
    ensureDir(dir);
    fs.writeFileSync(
      path.join(dir, 'analysis.json'),
      JSON.stringify(analysis),
      'utf8'
    );
  } catch (err) {
    console.error('[persistenceStore] Failed to write analysis.json:', err.message);
  }
}

/**
 * Persist the chats object for a repo.
 */
function saveChats(id, chats) {
  try {
    const dir = path.join(DATA_DIR, id);
    ensureDir(dir);
    fs.writeFileSync(
      path.join(dir, 'chats.json'),
      JSON.stringify(chats, null, 2),
      'utf8'
    );
  } catch (err) {
    console.error('[persistenceStore] Failed to write chats.json:', err.message);
  }
}

/**
 * Persist a full record (meta + analysis if present + chats if present).
 */
function save(record) {
  saveMeta(record);
  if (record.analysis) {
    saveAnalysis(record.id, record.analysis);
  }
  if (record.chats) {
    saveChats(record.id, record.chats);
  }
}

// ── Read helpers ──────────────────────────────────────────────────────────────

/**
 * Load a single record from disk.  Returns null if not found or corrupt.
 */
function load(id) {
  try {
    const dir = path.join(DATA_DIR, id);
    const metaPath = path.join(dir, 'meta.json');
    if (!fs.existsSync(metaPath)) return null;

    const record = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

    // Restore dates (JSON.parse gives strings)
    if (record.uploadedAt) record.uploadedAt = new Date(record.uploadedAt);

    // If status was mid-analysis when the server shut down, mark as error
    if (record.status === 'analyzing' || record.status === 'pending') {
      record.status = 'error';
      record.error  = 'Server restarted during analysis — please re-upload.';
    }

    // Load analysis if it was completed
    const analysisPath = path.join(dir, 'analysis.json');
    if (record.status === 'ready' && fs.existsSync(analysisPath)) {
      record.analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
    }

    // Verify the extracted files are still on disk
    if (record.status === 'ready') {
      const filesDir = path.join(dir, 'files');
      if (!fs.existsSync(filesDir)) {
        record.status = 'error';
        record.error  = 'Extracted files were removed from disk. Please re-upload.';
        record.analysis = null;
      }
    }

    return record;
  } catch (err) {
    console.error(`[persistenceStore] Failed to load repo ${id}:`, err.message);
    return null;
  }
}

/**
 * Load chats from disk. Returns empty object if missing.
 */
function loadChats(id) {
  try {
    const dir = path.join(DATA_DIR, id);
    const chatsPath = path.join(dir, 'chats.json');
    if (!fs.existsSync(chatsPath)) return {};
    
    const content = fs.readFileSync(chatsPath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    console.error(`[persistenceStore] Failed to load chats for ${id}:`, err.message);
    return {};
  }
}

/**
 * Load all valid repos from disk.  Returns an array of records.
 * Called once at server startup.
 */
function loadAll() {
  ensureDir(DATA_DIR);
  try {
    const entries = fs.readdirSync(DATA_DIR, { withFileTypes: true });
    const records = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const record = load(entry.name);
      if (record) records.push(record);
    }
    if (records.length > 0) {
      console.log(`[persistenceStore] Restored ${records.length} repository record(s) from disk.`);
    }
    return records;
  } catch (err) {
    console.error('[persistenceStore] Failed to scan data directory:', err.message);
    return [];
  }
}

/**
 * Delete a repo's data directory from disk.
 */
function remove(id) {
  try {
    const dir = path.join(DATA_DIR, id);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (err) {
    console.error(`[persistenceStore] Failed to remove repo ${id}:`, err.message);
  }
}

module.exports = { save, saveMeta, saveAnalysis, saveChats, load, loadChats, loadAll, remove, getExtractPath, DATA_DIR };
