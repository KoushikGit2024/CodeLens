import axios from 'axios';
import JSZip from 'jszip';
import { v4 as uuidv4 } from 'uuid';
import * as repositoryStore from '../../services/analyzer/repository/repository.store.js';
import * as persistenceStore from '../../services/analyzer/repository/persistence.store.js';
import { startAnalysis } from '../../services/analyzer/analyzer.client.js';

// We can still keep an api instance for any true backend calls (like health checks)
const api = axios.create({
  baseURL: '/api',
  timeout: 60_000,
});

/**
 * Builds a nested file tree from a flat array of file paths.
 * Expected output structure matches backend buildFileTree:
 * [{ type: 'directory', name: 'src', path: 'src', children: [...] }, { type: 'file', name: 'index.js', path: 'index.js' }]
 */
function buildFileTreeFromPaths(paths) {
  const root = { type: 'directory', name: 'root', path: '', children: [] };
  
  for (const filePath of paths) {
    const parts = filePath.split('/');
    let currentDir = root;
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const currentPath = parts.slice(0, i + 1).join('/');
      
      let existingNode = currentDir.children.find(c => c.name === part);
      
      if (!existingNode) {
        existingNode = {
          type: isFile ? 'file' : 'directory',
          name: part,
          path: currentPath,
        };
        if (!isFile) {
          existingNode.children = [];
        }
        currentDir.children.push(existingNode);
      }
      
      if (!isFile) {
        currentDir = existingNode;
      }
    }
  }
  
  return root.children;
}

// ── Offline-First API Client ──────────────────────────────────────────────────
export const repositoryApi = {
  /** List all uploaded repositories */
  async listAll() {
    const repos = await repositoryStore.getAll();
    // Sort descending by uploadedAt
    repos.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    
    // Mimic axios response shape
    return { data: repos };
  },

  /** Upload a ZIP file. Returns { id, name, status } */
  async upload(file, options = {}, onProgress = () => {}) {
    const repoId = uuidv4();
    const repoName = file.name.replace(/\.zip$/i, '');
    
    // 1. Mark as extracting
    onProgress({ loaded: 10, total: 100 }); // Fake progress for parsing
    
    const record = {
      id: repoId,
      name: repoName,
      uploadedAt: new Date().toISOString(),
      status: 'analyzing',
      phase: 'extracting',
      analysisVersion: 2
    };
    await repositoryStore.set(repoId, record);
    
    try {
      // 2. Unzip using JSZip
      const zip = await JSZip.loadAsync(file);
      const files = Object.keys(zip.files).filter(name => !zip.files[name].dir);
      
      const ignorePatterns = options.ignorePatterns 
        ? options.ignorePatterns.split(',').map(s => s.trim())
        : [];
      
      let processedCount = 0;
      for (const filePath of files) {
        // Simple ignore check
        const shouldIgnore = ignorePatterns.some(p => filePath.includes(p)) || 
                             filePath.includes('node_modules') || 
                             filePath.includes('.git');
        
        if (!shouldIgnore) {
          const content = await zip.files[filePath].async('string');
          await persistenceStore.saveFile(repoId, filePath, content);
        }
        processedCount++;
        if (processedCount % 10 === 0) {
          onProgress({ loaded: 10 + (processedCount / files.length) * 20, total: 100 });
        }
      }
      
      // 3. Kick off Web Worker Analysis (non-blocking)
      // The startAnalysis call resolves when complete. We don't await it here so the UI returns early
      // just like the backend controller does.
      startAnalysis(repoId, options).catch(err => {
        console.error('Background analysis failed:', err);
      });
      
      // Respond immediately — client polls GET /:id for status
      return { data: { id: repoId, name: repoName, status: 'analyzing' } };
      
    } catch (err) {
      console.error('Upload/Extraction failed:', err);
      await repositoryStore.update(repoId, { status: 'error', error: err.message });
      throw err;
    }
  },

  /** Get repository record by id */
  async get(id) {
    const record = await repositoryStore.get(id);
    if (!record) throw new Error('Repository not found');
    return { data: record };
  },

  /** Batch manage repositories (delete or clear analysis) */
  async batchManage(ids, action) {
    if (action === 'delete') {
      for (const id of ids) {
        await repositoryStore.remove(id);
      }
    }
    return { data: { success: true } };
  },

  /** Get file tree */
  async listFiles(id) {
    const record = await repositoryStore.get(id);
    if (!record) throw new Error('Repository not found');
    
    const paths = await persistenceStore.listFilePaths(id);
    const tree = buildFileTreeFromPaths(paths);
    
    return { data: { id: record.id, name: record.name, tree } };
  },

  /** Get a single file's content */
  async getFile(id, filePath) {
    const content = await persistenceStore.loadFile(id, filePath);
    if (content === null) throw new Error('File not found');
    
    // Depending on usage, sometimes the backend served raw strings, sometimes binary.
    // For now we return raw content wrapped in data.
    return { data: content };
  },

  /** Get full dependency graph */
  async getDependencyGraph(id) {
    const record = await repositoryStore.get(id);
    if (!record || !record.analysis || !record.analysis.graph) {
      throw new Error('Graph not available');
    }
    return { data: record.analysis.graph };
  },

  /** Get dependency info for a single file */
  async getFileDependencyInfo(id, filePath) {
    const record = await repositoryStore.get(id);
    if (!record || !record.analysis || !record.analysis.graph) {
      throw new Error('Graph not available');
    }
    const graph = record.analysis.graph;
    // Map file path to 'file:path' ID format
    const nodeId = `file:${filePath}`;
    
    // Emulate getFileDependencies logic
    const dependencies = graph.edges
      .filter(e => e.source === nodeId)
      .map(e => ({ id: e.target, type: e.type }));
      
    const dependents = graph.edges
      .filter(e => e.target === nodeId)
      .map(e => ({ id: e.source, type: e.type }));
      
    return { data: { filePath, dependencies, dependents, dependencyCount: dependencies.length } };
  },

  // ── AI and CI Endpoints (still hitting backend for now if they require Watsonx) ──
  getArchitecture(id, options = {}) {
    const params = {};
    if (options.generateAi) params.ai = 'true';
    return api.get(`/repository/${id}/architecture`, { params });
  },
  getOverviewDocumentation: (id, options = {}) => {
    const params = {};
    if (options.generateAi) params.ai = 'true';
    return api.get(`/repository/${id}/documentation/overview`, { params });
  },
  getModuleDocumentation: (id, path, options = {}) => {
    const params = { path };
    if (options.generateAi) params.ai = 'true';
    return api.get(`/repository/${id}/documentation/file`, { params });
  },
  askQuestion: (id, question, activeContext) => {
    return api.post(`/repository/${id}/question`, { question, activeContext });
  },
  analyze: (id) => {
    return api.post(`/repository/${id}/analyze`, { mode: 'full' });
  },
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
export const getRefactoringIntelligence = (id) => api.get(`/repository/${id}/refactoring`).then(res => res.data);
export const getRefactoringCandidate = (id, candidateId) => api.get(`/repository/${id}/refactoring/${candidateId}`).then(res => res.data);
export const getRefactoringImpact = (id, candidateId) => api.get(`/repository/${id}/refactoring/${candidateId}/impact`).then(res => res.data);
export const getRefactoringInsights = (id, candidateId) => api.get(`/repository/${id}/refactoring/${candidateId}/insights`).then(res => res.data);
export const autoFixRefactoringCandidate = (id, candidateId) => api.post(`/repository/${id}/refactoring/${candidateId}/auto-fix`).then(res => res.data);

export default api;
