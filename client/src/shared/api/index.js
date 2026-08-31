import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 60_000,
});

// ── In-Memory API Cache ────────────────────────────────────────────────────────
// Prevents duplicate AI generation/analysis when navigating between pages.
const cache = new Map();

function cachedGet(url, config) {
  const key = url + (config ? JSON.stringify(config) : '');
  if (cache.has(key)) {
    return Promise.resolve(cache.get(key));
  }
  
  const promise = api.get(url, config).catch(err => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, promise);
  return promise;
}

export const repositoryApi = {
  /** List all uploaded repositories */
  listAll() {
    // Avoid caching this so we always get the freshest list
    return api.get('/repository/list/all');
  },

  /** Upload a ZIP file. Returns { id, name, status } */
  upload(file, options = {}, onProgress) {
    const form = new FormData();
    form.append('repository', file);
    if (options.ignorePatterns) {
      form.append('ignorePatterns', options.ignorePatterns);
    }
    return api.post('/repository/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress,
    });
  },

  /** Get repository record by id */
  get(id) {
    return cachedGet(`/repository/${id}`);
  },

  /** Get file tree */
  listFiles(id) {
    return cachedGet(`/repository/${id}/files`);
  },

  /** Get a single file's content */
  getFile(id, filePath) {
    return cachedGet(`/repository/${id}/file`, { params: { path: filePath } });
  },

  /** Get full dependency graph */
  getDependencyGraph(id) {
    return cachedGet(`/repository/${id}/graph`);
  },

  /** Get dependency info for a single file */
  getFileDependencyInfo(id, filePath) {
    return cachedGet(`/repository/${id}/graph/file`, { params: { path: filePath } });
  },

  /** Get repository architecture */
  getArchitecture(id) {
    return cachedGet(`/repository/${id}/architecture`);
  },

  // Documentation
  getOverviewDocumentation: (id) =>
    cachedGet(`/repository/${id}/documentation/overview`),
  getModuleDocumentation: (id, path) =>
    cachedGet(`/repository/${id}/documentation/file`, { params: { path } }),

  // AI Repository Intelligence (Step 8)
  askQuestion: (id, question, activeContext) => {
    return api.post(`/repository/${id}/question`, { question, activeContext });
  },

  /** Save chat history to the repository */
  saveChatHistory(id, chatId, history) {
    return api.put(`/repository/${id}/chat/${chatId}`, { history });
  },

  // CI / Incremental Analysis
  analyzeIncremental: (id) => {
    return api.post(`/repository/${id}/analyze`, { mode: 'incremental' });
  },
  getChangeImpact: (repoId) => cachedGet(`/repository/${repoId}/impact`),
  getCiReport: (repoId) => cachedGet(`/repository/${repoId}/ci-report`),
  getIntelligence: (repoId) => cachedGet(`/repository/${repoId}/intelligence`),
  getRisks: (repoId) => cachedGet(`/repository/${repoId}/risks`)
};

export const getAiHealth = () => api.get('/health/ai').then(res => res.data);

export const getEngineeringRisks = (id) => cachedGet(`/repository/${id}/risks`).then(res => res.data);
export const getEngineeringInsights = (id) => cachedGet(`/repository/${id}/risks/insights`).then(res => res.data);

// Step 13
export const getRefactoringIntelligence = (id) => cachedGet(`/repository/${id}/refactoring`).then(res => res.data);
export const getRefactoringCandidate = (id, candidateId) => cachedGet(`/repository/${id}/refactoring/${candidateId}`).then(res => res.data);
export const getRefactoringImpact = (id, candidateId) => cachedGet(`/repository/${id}/refactoring/${candidateId}/impact`).then(res => res.data);
export const getRefactoringInsights = (id, candidateId) => cachedGet(`/repository/${id}/refactoring/${candidateId}/insights`).then(res => res.data);
export const autoFixRefactoringCandidate = (id, candidateId) => api.post(`/repository/${id}/refactoring/${candidateId}/auto-fix`).then(res => res.data);

export default api;
