import axios from 'axios';
import JSZip from 'jszip';
import { v4 as uuidv4 } from 'uuid';
import * as repositoryStore from '../../services/analyzer/repository/repository.store.js';
import * as persistenceStore from '../../services/analyzer/repository/persistence.store.js';
import { startAnalysis } from '../../services/analyzer/analyzer.client.js';

import { buildArchitectureModel } from '../../services/analyzer/advanced/architecture.analyzer.js';
import { buildRepositoryIntelligence } from '../../services/analyzer/advanced/intelligence.analyzer.js';
import { buildEngineeringRiskModel } from '../../services/analyzer/advanced/risk.analyzer.js';
import { buildRefactoringIntelligence } from '../../services/analyzer/advanced/refactoring.analyzer.js';
import { analyzeChangeImpact } from '../../services/analyzer/advanced/change.impact.js';
import { buildQuestionContext } from '../../services/analyzer/advanced/question.context.js';
import { buildPrompt } from '../../services/analyzer/advanced/base.context.js';
import { buildOverviewContext, buildModuleContext, buildOverviewPrompt, buildModulePrompt } from '../../services/analyzer/advanced/documentation.context.js';

// We can still keep an api instance for any true backend calls (like health checks or LLM proxied calls)
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

    // Derive language from file extension so the Monaco editor gets the right
    // syntax highlighter. This mirrors what the server-side getFile endpoint
    // returned as the `language` field that ExplorerPage destructures.
    const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
    const EXT_TO_LANG = {
      '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript', '.jsx': 'javascript',
      '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
      '.py': 'python', '.java': 'java',
      '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.h': 'cpp', '.hpp': 'cpp',
      '.json': 'json', '.md': 'markdown', '.css': 'css',
      '.html': 'html', '.htm': 'html', '.xml': 'xml',
      '.yaml': 'yaml', '.yml': 'yaml', '.sh': 'shell', '.env': 'ini',
    };
    const language = EXT_TO_LANG[ext] || 'plaintext';

    // ExplorerPage destructures { content, language } from fileRes.value.data
    return { data: { content, language } };
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
      .map(e => {
        const isPkg = e.target.startsWith('pkg:');
        return {
          id: e.target,
          type: e.type,
          filePath: !isPkg ? e.target.replace('file:', '') : undefined,
          package: isPkg ? e.target.replace('pkg:', '') : undefined
        };
      });
      
    const dependents = graph.edges
      .filter(e => e.target === nodeId)
      .map(e => {
        const isPkg = e.source.startsWith('pkg:');
        return {
          id: e.source,
          type: e.type,
          filePath: !isPkg ? e.source.replace('file:', '') : undefined,
          package: isPkg ? e.source.replace('pkg:', '') : undefined
        };
      });
      
    const externalPackages = [...new Set(dependencies.filter(d => d.package).map(d => d.package))];
      
    return { 
      data: { 
        filePath, 
        dependencies: dependencies.filter(d => !d.package), 
        dependents, 
        externalPackages,
        dependencyCount: dependencies.filter(d => !d.package).length,
        dependentCount: dependents.length
      } 
    };
  },

  // ── Offline Advanced Intelligence Endpoints ──────────────────────────────────
  async getArchitecture(id, options = {}) {
    const record = await repositoryStore.get(id);
    if (!record || !record.analysis || !record.analysis.graph) throw new Error('Graph not available');
    const architecture = buildArchitectureModel(record.analysis, record.analysis.graph);
    
    if (options.generateAi) {
      // Stub: in reality we would POST the computed context to Watsonx
      // For now, we will return the deterministic model
      return { data: { model: architecture } };
    }
    return { data: { model: architecture } };
  },

  async getIntelligence(repoId) {
    const record = await repositoryStore.get(repoId);
    if (!record || !record.analysis || !record.analysis.graph) throw new Error('Graph not available');
    const architecture = buildArchitectureModel(record.analysis, record.analysis.graph);
    const intelligence = buildRepositoryIntelligence(record.analysis, record.analysis.graph, architecture);
    return { data: intelligence };
  },

  async getRisks(repoId) {
    const record = await repositoryStore.get(repoId);
    if (!record || !record.analysis || !record.analysis.graph) throw new Error('Graph not available');
    const architecture = buildArchitectureModel(record.analysis, record.analysis.graph);
    const risks = buildEngineeringRiskModel(record.analysis, record.analysis.graph, architecture);
    return { data: risks };
  },

  async getChangeImpact(repoId, files) {
    const record = await repositoryStore.get(repoId);
    if (!record || !record.analysis || !record.analysis.graph) throw new Error('Graph not available');
    const impact = analyzeChangeImpact(record.analysis, record.analysis.graph, files || []);
    return { data: impact };
  },

  async getRefactoringIntelligence(repoId) {
    const record = await repositoryStore.get(repoId);
    if (!record || !record.analysis || !record.analysis.graph) throw new Error('Graph not available');
    const architecture = buildArchitectureModel(record.analysis, record.analysis.graph);
    const risks = buildEngineeringRiskModel(record.analysis, record.analysis.graph, architecture);
    const refactoring = buildRefactoringIntelligence(risks);
    return { data: refactoring };
  },

  async getRefactoringImpact(repoId, candidateId) {
    return { data: { files: [], complexity: 'Low', effort: 'Unknown' } };
  },

  async getRefactoringInsights(repoId, candidateId) {
    return { data: { insights: "AI refactoring insights not yet ported to offline-first." } };
  },

  async autoFixRefactoringCandidate(repoId, candidateId) {
    throw new Error('Auto-fix is currently disabled in offline mode.');
  },

  // ── AI Prompt Endpoints ──────────────────────────────────────────────────────
  async askQuestion(id, question, activeContext) {
    const record = await repositoryStore.get(id);
    if (!record || !record.analysis || !record.analysis.graph) throw new Error('Analysis not available');

    // Build the giant prompt string offline!
    const { routing, contextData } = await buildQuestionContext(record.analysis, question, id, activeContext);
    
    // Convert to a raw prompt
    const promptContext = {
       question,
       repository: contextData.meta,
       files: contextData.files,
       truncated: false
    };
    const rawPrompt = buildPrompt(promptContext);
    
    // Append facts manually for now
    const fullPrompt = contextData.facts.length > 0 
      ? `Facts:\n${contextData.facts.join('\n')}\n\n${rawPrompt}` 
      : rawPrompt;

    // Send the compiled prompt to the generic backend AI endpoint
    return api.post(`/ai/chat`, { prompt: fullPrompt });
  },

  async getOverviewDocumentation(id, options = {}) {
    const record = await repositoryStore.get(id);
    if (!record || !record.analysis || !record.analysis.graph) throw new Error('Analysis not available');

    const architecture = buildArchitectureModel(record.analysis, record.analysis.graph);
    const context = buildOverviewContext(record.analysis, record.analysis.graph, architecture);

    if (options.generateAi) {
      const prompt = buildOverviewPrompt(context);
      const aiResponse = await api.post(`/ai/chat`, { prompt, jsonMode: true });
      return { data: { facts: context, aiGenerated: aiResponse.data.response } };
    }
    
    return { data: { facts: context } };
  },
  
  async getModuleDocumentation(id, path, options = {}) {
    const record = await repositoryStore.get(id);
    if (!record || !record.analysis || !record.analysis.graph) throw new Error('Analysis not available');

    const architecture = buildArchitectureModel(record.analysis, record.analysis.graph);
    const context = buildModuleContext(record.analysis, record.analysis.graph, architecture, path);

    if (options.generateAi) {
      const prompt = buildModulePrompt(context);
      const aiResponse = await api.post(`/ai/chat`, { prompt, jsonMode: true });
      return { data: { facts: context, aiGenerated: aiResponse.data.response } };
    }
    
    return { data: { facts: context } };
  },

  // ── CI / Trigger Endpoints ───────────────────────────────────────────────────
  analyze: async (id) => {
    await repositoryStore.update(id, { status: 'analyzing', phase: 'extracting', error: null });
    startAnalysis(id, {}).catch(err => console.error('Background analysis failed:', err));
    return { data: { success: true } };
  },
  analyzeIncremental: async (id) => {
    await repositoryStore.update(id, { status: 'analyzing', phase: 'extracting', error: null });
    startAnalysis(id, {}).catch(err => console.error('Background analysis failed:', err));
    return { data: { success: true } };
  },
  getCiReport: (repoId) => api.get(`/repository/${repoId}/ci-report`),
};

export const getAiHealth = () => api.get('/health/ai').then(res => res.data);
export const getEngineeringRisks = (id) => repositoryApi.getRisks(id).then(res => res.data);
export const getEngineeringInsights = (id) => api.get(`/repository/${id}/risks/insights`).then(res => res.data);
export const getRefactoringIntelligence = (id) => repositoryApi.getRefactoringIntelligence(id).then(res => res.data);
export const getRefactoringCandidate = (id, candidateId) => repositoryApi.getRefactoringIntelligence(id).then(res => res.data.candidates.find(c => c.id === candidateId));
export const getRefactoringImpact = (id, candidateId) => repositoryApi.getChangeImpact(id).then(res => res.data); // Mocked
export const getRefactoringInsights = (id, candidateId) => api.get(`/repository/${id}/refactoring/${candidateId}/insights`).then(res => res.data);
export const autoFixRefactoringCandidate = (id, candidateId) => api.post(`/repository/${id}/refactoring/${candidateId}/auto-fix`).then(res => res.data);

export default api;
