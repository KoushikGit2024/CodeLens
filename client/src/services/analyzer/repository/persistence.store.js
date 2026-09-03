import { openDB } from 'idb';

const DB_NAME = 'CodeLensDB';
const DB_VERSION = 1;

/**
 * Initialize IndexedDB.
 */
async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('repos')) {
        db.createObjectStore('repos', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files', { keyPath: ['repoId', 'filePath'] });
      }
    },
  });
}

/**
 * Save the meta information of a repository record.
 */
export async function saveMeta(record) {
  const db = await getDB();
  // Extract only meta fields, excluding analysis and chats
  const meta = {
    id: record.id,
    name: record.name,
    uploadedAt: record.uploadedAt,
    status: record.status,
    error: record.error,
    analysisVersion: record.analysisVersion,
  };
  
  const tx = db.transaction('repos', 'readwrite');
  const store = tx.objectStore('repos');
  const existing = await store.get(record.id) || {};
  await store.put({ ...existing, ...meta });
  await tx.done;
}

/**
 * Save the analysis result for a repository.
 */
export async function saveAnalysis(record) {
  if (!record.analysis) return;
  const db = await getDB();
  const tx = db.transaction('repos', 'readwrite');
  const store = tx.objectStore('repos');
  const existing = await store.get(record.id) || { id: record.id };
  await store.put({ ...existing, analysis: record.analysis });
  await tx.done;
}

/**
 * Save both meta and analysis.
 */
export async function save(record) {
  await saveMeta(record);
  await saveAnalysis(record);
}

/**
 * Load a single repository record from IDB.
 */
export async function load(id) {
  const db = await getDB();
  return await db.get('repos', id);
}

/**
 * Load all repository records.
 */
export async function loadAll() {
  const db = await getDB();
  return await db.getAll('repos');
}

/**
 * Remove a repository and all its files from IDB.
 */
export async function remove(id) {
  const db = await getDB();
  
  // Remove repo metadata
  const txRepos = db.transaction('repos', 'readwrite');
  await txRepos.objectStore('repos').delete(id);
  await txRepos.done;
  
  // Remove associated files
  const txFiles = db.transaction('files', 'readwrite');
  const store = txFiles.objectStore('files');
  let cursor = await store.openCursor();
  while (cursor) {
    if (cursor.key[0] === id) {
      await cursor.delete();
    }
    cursor = await cursor.continue();
  }
  await txFiles.done;
}

/**
 * Remove only the analysis data for a repo.
 */
export async function removeAnalysis(id) {
  const db = await getDB();
  const tx = db.transaction('repos', 'readwrite');
  const store = tx.objectStore('repos');
  const existing = await store.get(id);
  if (existing) {
    delete existing.analysis;
    await store.put(existing);
  }
  await tx.done;
}

// ── File Storage API ──────────────────────────────────────────────────────────

/**
 * Save a file to the virtual file system.
 */
export async function saveFile(repoId, filePath, content) {
  const db = await getDB();
  await db.put('files', { repoId, filePath, content });
}

/**
 * Load a file from the virtual file system.
 */
export async function loadFile(repoId, filePath) {
  const db = await getDB();
  const file = await db.get('files', [repoId, filePath]);
  return file ? file.content : null;
}

/**
 * Load all files for a given repository.
 * Returns an array of { repoId, filePath, content }.
 */
export async function loadAllFiles(repoId) {
  const db = await getDB();
  const tx = db.transaction('files', 'readonly');
  const store = tx.objectStore('files');
  const files = [];
  let cursor = await store.openCursor();
  while (cursor) {
    if (cursor.key[0] === repoId) {
      files.push(cursor.value);
    }
    cursor = await cursor.continue();
  }
  return files;
}
