/**
 * repositoryStore — in-memory session store for this MVP.
 *
 * Shape:
 *   Map<string, RepositoryRecord>
 *
 * RepositoryRecord {
 *   id:          string         — uuid
 *   name:        string         — derived from uploaded filename
 *   uploadedAt:  Date
 *   status:      'pending' | 'analyzing' | 'ready' | 'error'
 *   error?:      string
 *   extractPath: string         — temporary extraction directory
 *   analysisVersion: number     — monotonic version counter
 *   analysis?:   AnalysisResult — populated after analysis completes
 * }
 */
const store = new Map();

module.exports = {
  set(id, record) {
    store.set(id, record);
  },
  get(id) {
    return store.get(id) || null;
  },
  update(id, patch) {
    const existing = store.get(id);
    if (!existing) throw new Error(`Repository ${id} not found in store`);
    store.set(id, { ...existing, ...patch });
  },
  all() {
    return Array.from(store.values());
  },
};
