import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 60_000,
});

export const repositoryApi = {
  /** Upload a ZIP file. Returns { id, name, status } */
  upload(file, onProgress) {
    const form = new FormData();
    form.append('repository', file);
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

  /** Ask a natural-language question about the repository */
  ask(id, question) {
    return api.post(`/repository/${id}/ask`, { question });
  },
};

export default api;
