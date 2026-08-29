import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 60_000,
});

export const repositoryApi = {
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
    return api.get(`/repository/${id}`);
  },

  /** Get file tree */
  listFiles(id) {
    return api.get(`/repository/${id}/files`);
  },

  /** Get a single file's content */
  getFile(id, filePath) {
    return api.get(`/repository/${id}/file`, { params: { path: filePath } });
  },

  /** Get full dependency graph */
  getDependencyGraph(id) {
    return api.get(`/repository/${id}/graph`);
  },

  /** Get dependency info for a single file */
  getFileDependencyInfo(id, filePath) {
    return api.get(`/repository/${id}/graph/file`, { params: { path: filePath } });
  },

  /** Get repository architecture */
  getArchitecture(id) {
    return api.get(`/repository/${id}/architecture`);
  },

  // Documentation
  getOverviewDocumentation: (id) =>
    api.get(`/repository/${id}/documentation/overview`),
  getModuleDocumentation: (id, path) =>
    api.get(`/repository/${id}/documentation/file`, { params: { path } }),

  // AI (Legacy)
  ask: (id, question) =>{
    return api.post(`/repository/${id}/ask`, { question });
  },

  // AI Repository Intelligence (Step 8)
  askQuestion: (id, question) => {
    return api.post(`/repository/${id}/question`, { question });
  },

  // CI / Incremental Analysis
  analyzeIncremental: (id) => {
    return api.post(`/repository/${id}/analyze`, { mode: 'incremental' });
  },
  getChangeImpact: (repoId) => api.get(`/repository/${repoId}/impact`),
  getCiReport: (repoId) => api.get(`/repository/${repoId}/ci-report`),
  getIntelligence: (repoId) => api.get(`/repository/${repoId}/intelligence`),
  getRisks: (repoId) => api.get(`/repository/${repoId}/risks`)
};

export const getAiHealth = () => api.get('/health/ai').then(res => res.data);

export const getEngineeringRisks = (id) => api.get(`/repository/${id}/risks`).then(res => res.data);
export const getEngineeringInsights = (id) => api.get(`/repository/${id}/risks/insights`).then(res => res.data);

// Step 13
export const getRefactoringIntelligence = (id) => api.get(`/repository/${id}/refactoring`).then(res => res.data);
export const getRefactoringCandidate = (id, candidateId) => api.get(`/repository/${id}/refactoring/${candidateId}`).then(res => res.data);
export const getRefactoringImpact = (id, candidateId) => api.get(`/repository/${id}/refactoring/${candidateId}/impact`).then(res => res.data);
export const getRefactoringInsights = (id, candidateId) => api.get(`/repository/${id}/refactoring/${candidateId}/insights`).then(res => res.data);

export default api;
