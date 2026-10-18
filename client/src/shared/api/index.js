/**
 * index.js (API Bridge)
 *
 * It intercepts frontend data requests, then extracts local IndexedDB payloads,
 * and then it applies them to the UI or proxies prompts to the configured AI provider.
 */
import axios from 'axios';
import JSZip from 'jszip';
import { v4 as uuidv4 } from 'uuid';
import * as repositoryStore from '../../services/analyzer/repository/repository.store.js';
import * as persistenceStore from '../../services/analyzer/repository/persistence.store.js';
import { startAnalysis } from '../../services/analyzer/analyzer.client.js';
import { supabase } from '../lib/supabase.js';

import { buildArchitectureModel } from '../../services/analyzer/advanced/architecture.analyzer.js';
import { buildRepositoryIntelligence } from '../../services/analyzer/advanced/intelligence.analyzer.js';
import {
  buildEngineeringRiskModel,
  recalculateScoreWithIgnored,
  SEVERITY_PENALTY,
} from '../../services/analyzer/advanced/risk.analyzer.js';
import { buildRefactoringIntelligence } from '../../services/analyzer/advanced/refactoring.analyzer.js';
import { analyzeChangeImpact } from '../../services/analyzer/advanced/change.impact.js';
import { buildQuestionContext } from '../../services/analyzer/advanced/question.context.js';
import { cloneAndExtractGithub } from '../../services/analyzer/repository/github.importer.js';
import { buildPrompt } from '../../services/analyzer/advanced/base.context.js';
import {
  buildOverviewContext,
  buildModuleContext,
  buildOverviewPrompt,
  buildModulePrompt,
} from '../../services/analyzer/advanced/documentation.context.js';
import { aiArtifactStore, buildCacheKey } from '../../services/storage/aiArtifact.store.js';
import { clearRepoBookmarks } from '../../services/storage/bookmark.store.js';
import { ContextOrchestrator } from '../../services/analyzer/advanced/context.orchestrator.js';
import { sanitizeAiError } from '../utils/aiError.js';

function getBaseUrl() {
  const rawUrl = import.meta.env.VITE_API_URL;
  if (import.meta.env.PROD) {
    const targetUrl = (rawUrl || 'https://codelens-server-cktb.onrender.com').trim().replace(/\/+$/, '');
    return targetUrl.endsWith('/api') ? targetUrl : `${targetUrl}/api`;
  }
  return '/api';
}

// It initiates the axios instance, then extracts the base configuration, and then it applies a timeout for LLM proxy calls.
const api = axios.create({
  baseURL: getBaseUrl(),
  timeout: 60_000,
});
api.interceptors.request.use(
  async config => {
    let {
      data: { session },
    } = await supabase.auth.getSession();

    // If session token is expired or within 60s of expiring, proactively refresh it
    if (session && session.expires_at && session.expires_at * 1000 < Date.now() + 60000) {
      try {
        const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
        if (!refreshErr && refreshData?.session) {
          session = refreshData.session;
        }
      } catch {
        // Fall back to existing session
      }
    }

    if (session?.access_token) {
      config.headers.Authorization = `Bearer ${session.access_token}`;
    }
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  async response => {
    if (response.status === 202 && response.data?.jobId) {
      const jobId = response.data.jobId;
      while (true) {
        await new Promise(r => setTimeout(r, 2000));
        const pollRes = await axios.get(`${api.defaults.baseURL}/ai/job/${jobId}`, {
          headers: { Authorization: response.config.headers.Authorization },
        });
        if (pollRes.data.status === 'completed') {
          return { ...response, status: 200, data: { response: pollRes.data.result } };
        }
        if (pollRes.data.status === 'failed') {
          const sanitized = sanitizeAiError(pollRes.data.error || 'AI Job failed.');
          const err = new Error(sanitized.message);
          err.aiError = sanitized;
          return Promise.reject(err);
        }
      }
    }
    return response;
  },
  async error => {
    const originalRequest = error.config;
    if (
      error.response?.status === 401 &&
      error.response?.data?.error === 'Invalid or expired token' &&
      originalRequest &&
      !originalRequest._retry
    ) {
      originalRequest._retry = true;
      try {
        const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
        if (!refreshErr && refreshData?.session?.access_token) {
          originalRequest.headers.Authorization = `Bearer ${refreshData.session.access_token}`;
          return api(originalRequest);
        }
      } catch {
        // Refresh failed, proceed with original error rejection
      }
    }
    return Promise.reject(error);
  }
);

/**
 * It iterates over flat file paths, then extracts their directory segments,
 * and then it applies nested object creation to build a hierarchical UI tree.
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
  /**
   * It queries the IndexedDB store, then extracts all saved repository records,
   * and then it applies a descending chronological sort for the dashboard.
   */
  async listAll() {
    const repos = await repositoryStore.getAll();
    repos.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    return { data: repos };
  },

  /**
   * It receives the ZIP file, then extracts its uncompressed text contents,
   * and then it applies them to the local virtual file system before triggering the Web Worker.
   */
  async upload(file, options = {}, onProgress = () => {}) {
    const repoId = uuidv4();
    const repoName = file.name.replace(/\.zip$/i, '');

    onProgress({ loaded: 10, total: 100 });

    const record = {
      id: repoId,
      name: repoName,
      uploadedAt: new Date().toISOString(),
      status: 'analyzing',
      phase: 'extracting',
      analysisVersion: 2,
    };
    await repositoryStore.set(repoId, record);

    try {
      const zip = await JSZip.loadAsync(file);
      const files = Object.keys(zip.files).filter(name => !zip.files[name].dir);

      const ignorePatterns = options.ignorePatterns
        ? options.ignorePatterns
            .split(/[\n,]+/)
            .map(s => s.trim())
            .filter(Boolean)
        : [];

      let commonRoot = '';
      if (files.length > 0) {
        const firstParts = files[0].split('/');
        if (firstParts.length > 1) {
          const possibleRoot = firstParts[0] + '/';
          if (files.every(f => f.startsWith(possibleRoot))) {
            commonRoot = possibleRoot;
          }
        }
      }

      let processedCount = 0;
      for (const originalPath of files) {
        const filePath = commonRoot ? originalPath.substring(commonRoot.length) : originalPath;
        const defaultIgnores = ['node_modules', 'dist', 'build', 'coverage', '.next', 'out'];
        const pathSegments = filePath.split('/');
        const shouldIgnore =
          ignorePatterns.some(p => filePath.includes(p)) ||
          defaultIgnores.some(ignoreDir => pathSegments.includes(ignoreDir));

        if (!shouldIgnore) {
          const extMatch = filePath.match(/\.(png|jpe?g|gif|webp|ico|bmp)$/i);
          let content;
          if (extMatch) {
            const ext = extMatch[1].toLowerCase();
            const mimeType = ext === 'jpg' ? 'jpeg' : ext;
            const base64 = await zip.files[originalPath].async('base64');
            content = `data:image/${mimeType};base64,${base64}`;
          } else if (filePath.match(/(^|\/)\.git\//)) {
            content = await zip.files[originalPath].async('uint8array');
          } else {
            content = await zip.files[originalPath].async('string');
          }
          await persistenceStore.saveFile(repoId, filePath, content);
        }
        processedCount++;
        if (processedCount % 10 === 0) {
          onProgress({ loaded: 10 + (processedCount / files.length) * 20, total: 100, currentFile: filePath });
        }
      }

      startAnalysis(repoId, options).catch(err => {
        console.error('Background analysis failed:', err);
      });

      return { data: { id: repoId, name: repoName, status: 'analyzing' } };
    } catch (err) {
      console.error('Upload/Extraction failed:', err);
      await repositoryStore.update(repoId, { status: 'error', error: err.message });
      throw err;
    }
  },

  /**
   * Directly processes a FileList from a folder upload, skipping JSZip.
   */
  async uploadDirectory(fileList, rootName, options = {}, onProgress = () => {}) {
    const repoId = uuidv4();

    onProgress({ loaded: 10, total: 100 });

    const record = {
      id: repoId,
      name: rootName,
      uploadedAt: new Date().toISOString(),
      status: 'analyzing',
      phase: 'extracting',
      analysisVersion: 2,
    };
    await repositoryStore.set(repoId, record);

    try {
      const files = Array.from(fileList);

      const ignorePatterns = options.ignorePatterns
        ? options.ignorePatterns
            .split(/[\n,]+/)
            .map(s => s.trim())
            .filter(Boolean)
        : [];

      let commonRoot = '';
      if (files.length > 0) {
        const firstParts = (files[0].webkitRelativePath || files[0].name).split('/');
        if (firstParts.length > 1) {
          const possibleRoot = firstParts[0] + '/';
          if (files.every(f => (f.webkitRelativePath || f.name).startsWith(possibleRoot))) {
            commonRoot = possibleRoot;
          }
        }
      }

      let processedCount = 0;
      for (const file of files) {
        const originalPath = file.webkitRelativePath || file.name;
        const filePath = commonRoot ? originalPath.substring(commonRoot.length) : originalPath;
        const defaultIgnores = ['node_modules', 'dist', 'build', 'coverage', '.next', 'out'];
        const pathSegments = filePath.split('/');
        const shouldIgnore =
          ignorePatterns.some(p => filePath.includes(p)) ||
          defaultIgnores.some(ignoreDir => pathSegments.includes(ignoreDir));

        if (!shouldIgnore) {
          const extMatch = filePath.match(/\.(png|jpe?g|gif|webp|ico|bmp)$/i);
          let content;
          if (extMatch) {
            content = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
          } else if (filePath.match(/(^|\/)\.git\//)) {
            const buffer = await file.arrayBuffer();
            content = new Uint8Array(buffer);
          } else {
            content = await file.text();
          }
          await persistenceStore.saveFile(repoId, filePath, content);
        }
        processedCount++;
        if (processedCount % 10 === 0) {
          onProgress({ loaded: 10 + (processedCount / files.length) * 20, total: 100, currentFile: filePath });
        }
      }

      startAnalysis(repoId, options).catch(err => {
        console.error('Background analysis failed:', err);
      });

      return { data: { id: repoId, name: rootName, status: 'analyzing' } };
    } catch (err) {
      console.error('Folder Upload failed:', err);
      await repositoryStore.update(repoId, { status: 'error', error: err.message });
      throw err;
    }
  },

  async importFromGitHub(url, options = {}, onProgress = () => {}) {
    const repoId = uuidv4();

    // Attempt to extract a decent rootName from the URL
    // e.g. https://github.com/facebook/react -> facebook/react
    let rootName = 'github-repo';
    try {
      const parts = new URL(url).pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        rootName = `${parts[0]}/${parts[1]}`;
      }
    } catch (e) {
      // ignore
    }

    const record = {
      id: repoId,
      name: rootName,
      uploadedAt: new Date().toISOString(),
      status: 'analyzing',
      phase: 'cloning',
      analysisVersion: 2,
    };
    await repositoryStore.set(repoId, record);

    try {
      const files = await cloneAndExtractGithub(repoId, url, onProgress, options.fetchAllBranches);

      const ignorePatterns = options.ignorePatterns
        ? options.ignorePatterns
            .split(/[\n,]+/)
            .map(s => s.trim())
            .filter(Boolean)
        : [];
      const defaultIgnores = ['node_modules', 'dist', 'build', 'coverage', '.next', 'out'];

      let processedCount = 0;
      for (const file of files) {
        const filePath = file.path;
        const pathSegments = filePath.split('/');
        const shouldIgnore =
          ignorePatterns.some(p => filePath.includes(p)) ||
          defaultIgnores.some(ignoreDir => pathSegments.includes(ignoreDir));

        if (!shouldIgnore) {
          await persistenceStore.saveFile(repoId, filePath, file.content);
        }
        processedCount++;
        if (processedCount % 10 === 0) {
          onProgress({
            loaded: 50 + (processedCount / files.length) * 50,
            total: 100,
            phase: 'Saving files...',
            currentFile: filePath,
          });
        }
      }

      startAnalysis(repoId, options).catch(err => {
        console.error('Background analysis failed:', err);
      });

      return { data: { id: repoId, name: rootName, status: 'analyzing' } };
    } catch (err) {
      console.error('GitHub Import failed:', err);
      await repositoryStore.update(repoId, { status: 'error', error: err.message });
      throw err;
    }
  },

  async get(id) {
    const record = await repositoryStore.get(id);
    if (!record) throw new Error('Repository not found');
    return { data: record };
  },

  async reanalyze(id, options = {}) {
    const record = await repositoryStore.get(id);
    if (!record) throw new Error('Repository not found');

    await repositoryStore.clearAnalysis(id);
    await repositoryStore.update(id, { status: 'analyzing', phase: 'uploading' });
    // Bust stale AI artifact cache so docs/ADRs are re-generated against the new analysis
    aiArtifactStore.invalidateRepo(id).catch(() => {});

    startAnalysis(id, options).catch(err => {
      console.error('Background analysis failed:', err);
    });

    return { data: { id, status: 'analyzing' } };
  },

  async batchManage(ids, action) {
    if (action === 'delete') {
      for (const id of ids) {
        await repositoryStore.remove(id);
        aiArtifactStore.invalidateRepo(id).catch(() => {});
        clearRepoBookmarks(id);
      }
    } else if (action === 'clear_analysis') {
      for (const id of ids) {
        await repositoryStore.clearAnalysis(id);
        aiArtifactStore.invalidateRepo(id).catch(() => {});
      }
    }
    return { data: { success: true } };
  },

  /**
   * It requests the file manifest, then extracts the absolute path keys,
   * and then it applies the tree builder to return a navigatable UI object.
   */
  async listFiles(id) {
    const record = await repositoryStore.get(id);
    if (!record) throw new Error('Repository not found');

    const paths = await persistenceStore.listFilePaths(id);
    const tree = buildFileTreeFromPaths(paths);

    return { data: { id: record.id, name: record.name, tree } };
  },

  /**
   * It queries the IndexedDB files store, then extracts the string buffer,
   * and then it applies a language mapping heuristic for the Monaco editor.
   */
  async getFile(id, filePath) {
    const resolvedPath = (await persistenceStore.resolveFilePath(id, filePath)) || filePath;
    const content = await persistenceStore.loadFile(id, resolvedPath);
    if (content === null) throw new Error('File not found');

    const ext = resolvedPath.slice(resolvedPath.lastIndexOf('.')).toLowerCase();
    const EXT_TO_LANG = {
      '.js': 'javascript',
      '.mjs': 'javascript',
      '.cjs': 'javascript',
      '.jsx': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.mts': 'typescript',
      '.cts': 'typescript',
      '.py': 'python',
      '.java': 'java',
      '.cpp': 'cpp',
      '.cc': 'cpp',
      '.cxx': 'cpp',
      '.h': 'cpp',
      '.hpp': 'cpp',
      '.go': 'go',
      '.rs': 'rust',
      '.c': 'c',
      '.json': 'json',
      '.md': 'markdown',
      '.css': 'css',
      '.html': 'html',
      '.htm': 'html',
      '.xml': 'xml',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.sh': 'shell',
      '.env': 'ini',
    };
    const language = EXT_TO_LANG[ext] || 'plaintext';

    return { data: { content, language, resolvedPath } };
  },

  async getDependencyGraph(id) {
    const record = await repositoryStore.get(id);
    if (!record || !record.analysis || !record.analysis.graph) throw new Error('Graph not available');
    return { data: record.analysis.graph };
  },

  /**
   * It resolves a single file node, then extracts its incoming and outgoing edges,
   * and then it applies structural mapping to return isolated dependency info.
   */
  async getFileDependencyInfo(id, filePath) {
    const record = await repositoryStore.get(id);
    if (!record || !record.analysis || !record.analysis.graph) throw new Error('Graph not available');

    const graph = record.analysis.graph;
    const nodeId = `file:${filePath}`;

    const dependencies = graph.edges
      .filter(e => e.source === nodeId)
      .map(e => {
        const isPkg = e.target.startsWith('pkg:');
        return {
          id: e.target,
          type: e.type,
          filePath: !isPkg ? e.target.replace('file:', '') : undefined,
          package: isPkg ? e.target.replace('pkg:', '') : undefined,
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
          package: isPkg ? e.source.replace('pkg:', '') : undefined,
        };
      });

    const externalPackages = [...new Set(dependencies.filter(d => d.package).map(d => d.package))];

    const architecture = buildArchitectureModel(record.analysis, graph);
    const engineeringHealth = buildEngineeringRiskModel(record.analysis, graph, architecture);

    const fileRisks = engineeringHealth.risks.filter(r => r.file === filePath);
    const hotspot = engineeringHealth.hotspots.find(h =>
      typeof h === 'string' ? h === filePath : h.file === filePath
    );
    const hotspotRisk = fileRisks.find(r => r.title.startsWith('Behavioral Hotspot'));

    let severity = 'healthy';
    if (fileRisks.some(r => r.severity === 'critical')) severity = 'critical';
    else if (fileRisks.some(r => r.severity === 'high')) severity = 'high';
    else if (fileRisks.some(r => r.severity === 'warning')) severity = 'warning';

    const hotspotData = hotspotRisk
      ? {
          file: filePath,
          score: hotspotRisk.evidence?.hotspotScore || (typeof hotspot === 'object' ? hotspot?.score : 50),
          quadrant: hotspotRisk.evidence?.quadrant,
          churnScore: hotspotRisk.evidence?.churnScore,
          complexityScore: hotspotRisk.evidence?.complexityScore,
        }
      : typeof hotspot === 'object'
        ? hotspot
        : hotspot
          ? { file: filePath, score: 50 }
          : null;

    return {
      data: {
        filePath,
        dependencies: dependencies.filter(d => !d.package),
        dependents,
        externalPackages,
        dependencyCount: dependencies.filter(d => !d.package).length,
        dependentCount: dependents.length,
        health: {
          severity,
          risks: fileRisks,
          hotspot: hotspotData,
        },
      },
    };
  },

  async getArchitecture(id, options = {}) {
    const repoId = id;
    const record = await repositoryStore.get(repoId);
    if (!record || !record.analysis || !record.analysis.graph) throw new Error('Graph not available');
    const architecture = record.analysis.architecture || buildArchitectureModel(record.analysis, record.analysis.graph);
    const health = buildEngineeringRiskModel(record.analysis, record.analysis.graph, architecture);

    architecture.layers.forEach(comp => {
      const compRisks = health.risks.filter(
        r =>
          comp.data.files?.includes(r.file) ||
          (r.category === 'ARCHITECTURE' && r.evidence?.component === comp.data.label)
      );

      let severity = 'healthy';
      if (compRisks.some(r => r.severity === 'critical')) severity = 'critical';
      else if (compRisks.some(r => r.severity === 'high')) severity = 'high';
      else if (compRisks.some(r => r.severity === 'warning')) severity = 'warning';

      comp.health = {
        severity,
        risks: compRisks,
      };
    });

    // Normalize shape: ArchitecturePage expects { components, relations, violations }
    // but buildArchitectureModel returns { layers, boundaryViolations, ... }
    const model = {
      components: architecture.layers || [],
      relations: architecture.uniqueRelations || [],
      violations: architecture.boundaryViolations || [],
      apiBoundaries: architecture.apiBoundaries || [],
      entryPoints: architecture.entryPoints || [],
    };

    const cacheKey = buildCacheKey(repoId, 'architecture_insights');

    if (!options.generateAi) {
      try {
        const cached = await aiArtifactStore.get(cacheKey, record?.analysisVersion);
        if (cached) {
          return { data: { model, insights: cached } };
        }
      } catch {
        // non-fatal cache read
      }
      return { data: { model } };
    }

    const prompt = ContextOrchestrator.buildArchitecturePrompt(model);
    const aiResponse = await api.post('/ai/chat', { prompt, jsonMode: true });
    let parsed = null;
    try {
      const raw = (aiResponse.data.response || '')
        .trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/, '')
        .replace(/\s*```$/, '');
      parsed = JSON.parse(raw);
    } catch (e) {
      parsed = { summary: aiResponse.data.response };
    }

    // Robust extraction of summary from any returned shape
    let summaryText =
      parsed?.summary ||
      parsed?.evaluation ||
      parsed?.architectural_evaluation ||
      parsed?.architecture_summary ||
      parsed?.architectureSummary ||
      parsed?.overview ||
      parsed?.analysis ||
      parsed?.response ||
      (typeof parsed === 'string' ? parsed : '');

    if (!summaryText && parsed && typeof parsed === 'object') {
      const parts = Object.entries(parsed)
        .filter(
          ([k, v]) =>
            typeof v === 'string' && !['status', 'id', 'intent', 'requiresAi'].includes(k) && v.trim().length > 0
        )
        .map(([k, v]) => `### ${k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}\n${v}`);
      if (parts.length > 0) {
        summaryText = parts.join('\n\n');
      }
    }

    const toArray = val => {
      if (!val) return [];
      if (Array.isArray(val))
        return val.map(v => (typeof v === 'string' ? v : v?.text || v?.description || JSON.stringify(v)));
      if (typeof val === 'string') return [val];
      if (typeof val === 'object') return Object.values(val).filter(v => typeof v === 'string');
      return [];
    };

    const normalizedInferences = toArray(
      parsed?.inferences || parsed?.observations || parsed?.findings || parsed?.keyCharacteristics
    );
    const normalizedRisks = toArray(parsed?.risks || parsed?.limitations || parsed?.concerns);
    const normalizedRecommendations = toArray(
      parsed?.recommendations || parsed?.recommendedActions || parsed?.strategies
    );

    // Deterministic structural facts straight from local analysis
    const facts = [
      `${model.components.length} component(s) detected across repository layers`,
      `${model.relations.length} inter-component relation(s) mapped`,
      model.violations.length > 0
        ? `${model.violations.length} boundary violation(s) detected`
        : 'Zero architecture boundary violations detected',
      model.entryPoints.length > 0
        ? `Identified entry point(s): ${model.entryPoints.slice(0, 3).join(', ')}`
        : 'No explicit entry points detected',
    ];

    const insights = {
      summary: summaryText || 'Architectural evaluation generated successfully.',
      facts,
      inferences: normalizedInferences,
      risks: normalizedRisks,
      recommendations: normalizedRecommendations,
      references: model.entryPoints || [],
    };

    try {
      await aiArtifactStore.set(cacheKey, insights, { analysisVersion: record?.analysisVersion });
    } catch {
      // non-fatal cache write
    }

    return { data: { model, insights } };
  },

  async getIntelligence(repoId, options = {}) {
    const record = await repositoryStore.get(repoId);
    if (!record || !record.analysis || !record.analysis.graph) throw new Error('Graph not available');

    const architecture = record.analysis.architecture || buildArchitectureModel(record.analysis, record.analysis.graph);
    const intelligence = buildRepositoryIntelligence(record.analysis, record.analysis.graph, architecture);

    const cacheKey = buildCacheKey(repoId, 'intelligence_insights');

    if (!options.generateAi) {
      try {
        const cached = await aiArtifactStore.get(cacheKey, record?.analysisVersion);
        if (cached) {
          return { data: { intelligence, insights: cached } };
        }
      } catch {
        // non-fatal
      }
      return { data: { intelligence } };
    }

    const prompt = ContextOrchestrator.buildIntelligencePrompt(intelligence);
    const aiResponse = await api.post('/ai/chat', { prompt });
    const summary = aiResponse.data.response || aiResponse.data.answer || 'Repository intelligence overview generated.';
    const insights = {
      summary,
      facts: [
        `${intelligence.repository.fileCount} files analyzed across ${intelligence.architecture.components} architectural component(s)`,
        `${intelligence.dependencies.nodes} nodes, ${intelligence.dependencies.edges} edges in the dependency graph`,
        intelligence.dependencies.cycles > 0
          ? `${intelligence.dependencies.cycles} circular dependency cycle(s) detected — requires attention`
          : 'No circular dependencies detected',
        `Engineering health score: ${intelligence.engineeringHealth.score}/100 (${intelligence.engineeringHealth.critical} critical, ${intelligence.engineeringHealth.high} high issues)`,
        `${intelligence.refactoring.candidateCount} refactoring candidate(s) identified`,
      ],
      references: (intelligence.hotspots || []).slice(0, 5).map(h => h.filePath),
    };

    try {
      await aiArtifactStore.set(cacheKey, insights, { analysisVersion: record?.analysisVersion });
    } catch {
      // non-fatal
    }

    return { data: { intelligence, insights } };
  },

  async getRisks(repoId, options = {}) {
    const record = await repositoryStore.get(repoId);
    if (!record || !record.analysis || !record.analysis.graph) throw new Error('Graph not available');
    const architecture = buildArchitectureModel(record.analysis, record.analysis.graph);
    // Load the user's persistent ignore list so the score and active risks exclude them
    const ignoredRiskIds = await persistenceStore.getIgnoredRiskIds(repoId);
    const risks = buildEngineeringRiskModel(record.analysis, record.analysis.graph, architecture, ignoredRiskIds);

    const cacheKey = buildCacheKey(repoId, 'health_interpretation');

    if (!options.generateAi) {
      try {
        const cached = await aiArtifactStore.get(cacheKey, record?.analysisVersion);
        if (cached) {
          return { data: { ...risks, insights: cached } };
        }
      } catch {
        // non-fatal
      }
      return { data: risks };
    }

    const prompt = options.singleRisk
      ? ContextOrchestrator.buildSingleRiskPrompt(options.singleRisk)
      : ContextOrchestrator.buildRisksPrompt(risks);
    const aiResponse = await api.post('/ai/chat', { prompt, jsonMode: true });
    let insights = null;
    try {
      const raw = (aiResponse.data.response || '')
        .trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/, '')
        .replace(/\s*```$/, '');
      insights = JSON.parse(raw);
    } catch (e) {
      insights = { summary: aiResponse.data.response };
    }

    if (insights && typeof insights === 'object') {
      const toArr = v => (Array.isArray(v) ? v : typeof v === 'string' && v.trim() ? [v] : []);
      insights.recommendations = toArr(insights.recommendations || insights.recommendedActions);
      insights.observations = toArr(insights.observations || insights.inferences);
      insights.references = toArr(insights.references);
    }

    try {
      if (!options.singleRisk && insights) {
        await aiArtifactStore.set(cacheKey, insights, { analysisVersion: record?.analysisVersion });
      }
    } catch {
      // non-fatal
    }

    return { data: { ...risks, insights } };
  },

  async getRefactoringInsights(repoId, candidateId, options = {}) {
    const record = await repositoryStore.get(repoId);
    if (!record || !record.analysis || !record.analysis.graph) throw new Error('Graph not available');
    const architecture = buildArchitectureModel(record.analysis, record.analysis.graph);
    const risks = buildEngineeringRiskModel(record.analysis, record.analysis.graph, architecture);
    const refactoring = buildRefactoringIntelligence(risks, record.analysis, record.analysis.graph);

    const candidate = refactoring.candidates.find(c => c.id === candidateId);
    if (!candidate) throw new Error('Candidate not found');

    const cacheKey = buildCacheKey(repoId, 'refactor_strategy', candidateId);

    if (!options.force) {
      try {
        const cached = await aiArtifactStore.get(cacheKey, record?.analysisVersion);
        if (cached) {
          return { data: cached };
        }
      } catch {
        // non-fatal
      }
    }

    if (options.checkCacheOnly) {
      return { data: null };
    }

    const prompt = ContextOrchestrator.buildRefactoringStrategyPrompt(candidate);

    const res = await api.post('/ai/chat', { prompt, jsonMode: true });
    let insights;
    try {
      const raw = (res.data.response || '')
        .trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/, '')
        .replace(/\s*```$/, '');
      insights = JSON.parse(raw);
    } catch (e) {
      insights = { summary: res.data.response };
    }

    try {
      if (insights) {
        await aiArtifactStore.set(cacheKey, insights, { analysisVersion: record?.analysisVersion });
      }
    } catch {
      // non-fatal
    }

    return { data: insights };
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
    const refactoring = buildRefactoringIntelligence(risks, record.analysis, record.analysis.graph);
    return { data: refactoring };
  },

  async getRefactoringImpact(repoId, candidateId) {
    const record = await repositoryStore.get(repoId);
    if (!record || !record.analysis || !record.analysis.graph) throw new Error('Graph not available');

    const architecture = buildArchitectureModel(record.analysis, record.analysis.graph);
    const risks = buildEngineeringRiskModel(record.analysis, record.analysis.graph, architecture);
    const refactoring = buildRefactoringIntelligence(risks, record.analysis, record.analysis.graph);

    const candidate = refactoring.candidates.find(c => c.id === candidateId);
    if (!candidate) throw new Error('Candidate not found');

    const files = candidate.files || [];
    const impact = analyzeChangeImpact(record.analysis, record.analysis.graph, files);
    return { data: impact };
  },

  async autoFixRefactoringCandidate(repoId, candidateId, options = {}) {
    const record = await repositoryStore.get(repoId);
    if (!record || !record.analysis || !record.analysis.graph) throw new Error('Graph not available');

    const architecture = buildArchitectureModel(record.analysis, record.analysis.graph);
    const risks = buildEngineeringRiskModel(record.analysis, record.analysis.graph, architecture);
    const refactoring = buildRefactoringIntelligence(risks, record.analysis, record.analysis.graph);

    const candidate = refactoring.candidates.find(c => c.id === candidateId);
    if (!candidate) throw new Error('Candidate not found');
    if (!candidate.files || candidate.files.length === 0) throw new Error('No files associated with this candidate');

    const targetFile = candidate.files[0];
    const cacheKey = buildCacheKey(repoId, 'autofix', candidateId);

    if (!options.force) {
      try {
        const cached = await aiArtifactStore.get(cacheKey, record?.analysisVersion);
        if (cached) {
          return { data: cached };
        }
      } catch {
        // non-fatal
      }
    }

    if (options.checkCacheOnly) {
      return { data: null };
    }

    const originalCode = await persistenceStore.loadFile(repoId, targetFile);
    if (!originalCode) throw new Error(`Could not load source file ${targetFile}`);

    // Phase 2: AST Snippet Slicing
    let slicedCode = originalCode;
    let snippetContext = '';
    if (candidate.fileRanges && candidate.fileRanges[targetFile]) {
      const range = candidate.fileRanges[targetFile];
      if (range.startLine && range.endLine) {
        const lines = originalCode.split('\n');
        const buffer = 5;
        const start = Math.max(0, range.startLine - 1 - buffer);
        const end = Math.min(lines.length, range.endLine + buffer);
        slicedCode = lines.slice(start, end).join('\n');
        snippetContext = `(Showing target lines ${start + 1} to ${end})`;
      }
    }

    // Phase 2b: Cross-File Clone Sibling Injection
    // If this is a clone, provide the other file's snippet so the AI can generalize the abstraction.
    let siblingContextText = '';
    if (candidate.title && candidate.title.includes('Clone') && candidate.files && candidate.files.length > 1) {
      const siblingFile = candidate.files.find(f => f !== targetFile);
      if (siblingFile) {
        try {
          const siblingCode = await persistenceStore.loadFile(repoId, siblingFile);
          if (siblingCode && candidate.fileRanges && candidate.fileRanges[siblingFile]) {
            const sRange = candidate.fileRanges[siblingFile];
            if (sRange.startLine && sRange.endLine) {
              const sLines = siblingCode.split('\n');
              const sStart = Math.max(0, sRange.startLine - 1 - 5);
              const sEnd = Math.min(sLines.length, sRange.endLine + 5);
              const sSliced = sLines.slice(sStart, sEnd).join('\n');
              siblingContextText = `\n\nCross-File Clone Sibling Context:\nThe following code in ${siblingFile} is identical to the target snippet. Please ensure your refactoring approach generalizes both use cases (e.g., by extracting a shared utility).\n\`\`\`\n${sSliced}\n\`\`\``;
            }
          }
        } catch (e) {
          console.warn('Could not load sibling clone file for context', e);
        }
      }
    }

    // Phase 3: Graph Context (Signatures)
    let impactConstraints = '';
    try {
      const impact = analyzeChangeImpact(record.analysis, record.analysis.graph, [targetFile]);
      if (impact.directlyAffectedFiles && impact.directlyAffectedFiles.length > 0) {
        const depSignatures = [];
        for (const depFile of impact.directlyAffectedFiles) {
          const fileMeta = record.analysis.files.find(f => f.filePath === depFile);
          if (fileMeta && fileMeta.exports && fileMeta.exports.length > 0) {
            depSignatures.push(`- ${depFile}: ${fileMeta.exports.map(e => e.name || e.id).join(', ')}`);
          } else {
            depSignatures.push(`- ${depFile}`);
          }
        }
        impactConstraints = `\nCRITICAL INTEGRATION CONSTRAINTS:\nThe following ${impact.directlyAffectedFiles.length} downstream file(s) depend on this module. You MUST preserve all existing exported function/class signatures, argument orders, and public APIs:\n${depSignatures.join('\n')}`;
      }
    } catch (e) {
      console.warn('Could not calculate downstream impact for constraints', e);
    }

    const strategiesText =
      candidate.suggestedStrategies?.map(s => `- ${s.action}: ${s.description}`).join('\n') ||
      'Improve code quality and structure.';

    let specificEvidenceText = '';
    if (candidate.evidence) {
      if (candidate.type === 'QUALITY' && candidate.evidence.instances) {
        specificEvidenceText =
          '\nSpecific Offending Code Blocks (AST Focus):\n' +
          candidate.evidence.instances
            .map(
              inst =>
                `- Function/Method '${inst.name}' has a high cyclomatic complexity of ${inst.complexity}. Target this specifically.`
            )
            .join('\n');
      } else if (candidate.type === 'SIZE') {
        specificEvidenceText = `\nSpecific File Metrics:\n- Lines of Code: ${candidate.evidence.lineCount}\n- Public Exports: ${candidate.evidence.exportCount}\n- Total File Complexity: ${candidate.evidence.complexity}`;
      } else if (candidate.type === 'COUPLING') {
        specificEvidenceText = `\nSpecific Coupling Issues:\n- Dependent Files (Fan-In): ${candidate.evidence.fanIn}\n- Dependencies (Fan-Out): ${candidate.evidence.fanOut}`;
      } else if (candidate.type === 'DEPENDENCY' && candidate.evidence.cyclePath) {
        specificEvidenceText = `\nCircular Dependency Path:\n${candidate.evidence.cyclePath.join(' -> ')}\nPlease refactor to break this exact circular reference.`;
      }
    }

    // Append sibling clone context to the evidence if it exists
    if (siblingContextText) {
      specificEvidenceText += siblingContextText;
    }

    const prompt = ContextOrchestrator.buildAutoFixPrompt(
      candidate,
      targetFile,
      slicedCode,
      impactConstraints,
      specificEvidenceText,
      strategiesText,
      snippetContext
    );

    const res = await api.post(`/ai/chat`, { prompt });
    const responseText = res.data?.response || res.data || '';

    let refactoredChunk = responseText;
    const codeBlockMatch = responseText.match(/```[a-z]*\n([\s\S]*?)\n```/);
    if (codeBlockMatch) {
      refactoredChunk = codeBlockMatch[1];
    } else {
      refactoredChunk = responseText;
    }

    // Phase 4: Apply the chunk replacement to get the full refactored file
    let refactoredCode = originalCode;
    if (slicedCode && slicedCode !== originalCode) {
      refactoredCode = originalCode.replace(slicedCode, refactoredChunk);
    } else {
      refactoredCode = refactoredChunk;
    }

    const result = { originalCode, refactoredCode, file: targetFile };
    try {
      await aiArtifactStore.set(cacheKey, result, { analysisVersion: record?.analysisVersion });
    } catch {
      // non-fatal
    }

    return { data: result };
  },

  async applyRefactoringFix(repoId, candidateId, filePath, refactoredCode) {
    await persistenceStore.saveFile(repoId, filePath, refactoredCode);
    const cacheKey = buildCacheKey(repoId, 'autofix', candidateId);
    try {
      const existing = (await aiArtifactStore.get(cacheKey)) || {};
      await aiArtifactStore.set(cacheKey, { ...existing, merged: true, mergedAt: Date.now() });
    } catch {
      // non-fatal
    }
    return { success: true };
  },

  async generateTestsRefactoringCandidate(repoId, candidateId, options = {}) {
    const record = await repositoryStore.get(repoId);
    if (!record || !record.analysis || !record.analysis.graph) throw new Error('Graph not available');

    const architecture = buildArchitectureModel(record.analysis, record.analysis.graph);
    const risks = buildEngineeringRiskModel(record.analysis, record.analysis.graph, architecture);
    const refactoring = buildRefactoringIntelligence(risks, record.analysis, record.analysis.graph);

    const candidate = refactoring.candidates.find(c => c.id === candidateId);
    if (!candidate) throw new Error('Candidate not found');
    if (!candidate.files || candidate.files.length === 0) throw new Error('No files associated with this candidate');

    const targetFile = candidate.files[0];
    const cacheKey = buildCacheKey(repoId, 'autofix_tests', candidateId);

    if (!options.force) {
      try {
        const cached = await aiArtifactStore.get(cacheKey, record?.analysisVersion);
        if (cached) {
          return { data: cached };
        }
      } catch {
        // non-fatal
      }
    }

    if (options.checkCacheOnly) {
      return { data: null };
    }

    const originalCode = await persistenceStore.loadFile(repoId, targetFile);
    if (!originalCode) throw new Error(`Could not load source file ${targetFile}`);

    const prompt = ContextOrchestrator.buildGenerateTestsPrompt(candidate, targetFile, originalCode);

    const res = await api.post(`/ai/chat`, { prompt });
    const responseText = res.data?.response || res.data || '';

    let testCode = responseText;
    const codeBlockMatch = responseText.match(/```[a-z]*\n([\s\S]*?)\n```/);
    if (codeBlockMatch) {
      testCode = codeBlockMatch[1];
    } else {
      testCode = responseText;
    }

    const result = { originalCode, testCode, file: targetFile };
    try {
      await aiArtifactStore.set(cacheKey, result, { analysisVersion: record?.analysisVersion });
    } catch {
      // non-fatal
    }

    return { data: result };
  },

  // ── AI Prompt Endpoints ──────────────────────────────────────────────────────
  /**
   * Builds the deterministic context (facts, files) without sending to the AI.
   * Useful for the Context Inspector UX.
   */
  async buildAIContext(id, question, activeContext) {
    const record = await repositoryStore.get(id);
    if (!record || !record.analysis || !record.analysis.graph) throw new Error('Analysis not available');

    const fileLoaderCallback = path => persistenceStore.loadFile(id, path);
    const { contextData, routing } = await buildQuestionContext(
      record.analysis,
      question,
      fileLoaderCallback,
      activeContext
    );

    return { ...contextData, routing };
  },

  /**
   * Sends the fully built context to the AI proxy.
   */
  async askQuestionWithContext(contextData, question, history = [], options = {}) {
    const promptContext = {
      question,
      repository: contextData.meta,
      files: contextData.files,
      truncated: false,
    };
    const rawPrompt = buildPrompt(promptContext);

    const fullPrompt =
      contextData.facts && contextData.facts.length > 0
        ? `Facts:\n${contextData.facts.join('\n')}\n\n${rawPrompt}`
        : rawPrompt;

    const reqOptions = options.signal ? { signal: options.signal } : {};
    return api.post(`/ai/chat`, { prompt: fullPrompt, history }, reqOptions);
  },

  /**
   * Legacy wrapper for standard flow with deterministic bypass and metadata attachment.
   */
  async askQuestion(id, question, activeContext, history = [], options = {}) {
    const isFirstTurn = !history || history.length === 0;
    const reqOptions = options.signal ? { signal: options.signal } : {};

    if (!isFirstTurn) {
      return api.post(`/ai/chat`, { prompt: question, history }, reqOptions);
    }

    const contextData = await this.buildAIContext(id, question, activeContext);
    if (contextData?.routing && contextData.routing.requiresAi === false) {
      return {
        data: {
          answer: {
            summary: contextData.facts.join('\n\n') || 'Deterministic answer computed.',
            facts: contextData.facts || [],
          },
          intent: contextData.routing.intent,
          requiresAi: false,
        },
      };
    }

    const res = await this.askQuestionWithContext(contextData, question, history, options);
    return {
      ...res,
      data: {
        ...(typeof res?.data === 'object' ? res.data : { response: res?.data }),
        facts: contextData?.facts || [],
        intent: contextData?.routing?.intent,
        requiresAi: true,
      },
    };
  },

  async getOverviewDocumentation(id, options = {}) {
    const record = await repositoryStore.get(id);
    if (!record || !record.analysis || !record.analysis.graph) throw new Error('Analysis not available');

    const architecture = buildArchitectureModel(record.analysis, record.analysis.graph);
    const context = buildOverviewContext(record.analysis, record.analysis.graph, architecture);

    const cacheKey = buildCacheKey(id, 'overview_doc');
    if (!options.force) {
      try {
        const cached = await aiArtifactStore.get(cacheKey, record.analysisVersion);
        if (cached) {
          return { data: { facts: context, aiInterpretation: cached, fromCache: true } };
        }
      } catch {
        // non-fatal
      }
    }

    if (options.generateAi) {
      const prompt = buildOverviewPrompt(context);
      const aiResponse = await api.post(`/ai/chat`, { prompt, jsonMode: true });
      let aiInterpretation = null;
      try {
        // The server's ai.service.js already strips fences and parses JSON when jsonMode=true,
        // but the response is re-serialised as a string to keep the client contract uniform.
        const raw = (aiResponse.data.response || '')
          .trim()
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/, '')
          .replace(/\s*```$/, '');
        aiInterpretation = JSON.parse(raw);
      } catch (e) {
        console.warn('[getOverviewDocumentation] Failed to parse AI JSON:', e.message);
      }

      if (aiInterpretation) {
        await aiArtifactStore.set(cacheKey, aiInterpretation, { analysisVersion: record.analysisVersion });
      }

      return { data: { facts: context, aiInterpretation } };
    }

    return { data: { facts: context, aiInterpretation: null } };
  },

  async generateADR(repoId, findingContext) {
    // ── Cache check (before calling the AI proxy) ────────────────────────
    const record = await repositoryStore.get(repoId).catch(() => null);
    const cacheKey = buildCacheKey(repoId, 'adr', findingContext.id || findingContext.title || '');
    const analysisVersion = record?.analysisVersion;
    const cached = await aiArtifactStore.get(cacheKey, analysisVersion);
    if (cached) return { data: cached };

    const prompt = ContextOrchestrator.buildADRPrompt(findingContext);

    const aiResponse = await api.post('/ai/chat', { prompt, jsonMode: true });
    let adr = null;
    try {
      const raw = (aiResponse.data.response || '')
        .trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/, '')
        .replace(/\s*```$/, '');
      adr = JSON.parse(raw);
    } catch (e) {
      throw new Error('Failed to generate ADR: Invalid AI response format');
    }

    adr.id = uuidv4();
    adr.date = new Date().toISOString().split('T')[0];

    // ── Store result in cache ────────────────────────────────────────────
    await aiArtifactStore.set(cacheKey, adr, { analysisVersion });

    return { data: adr };
  },

  async listADRs(repoId) {
    const list = await aiArtifactStore.listADRs(repoId);
    return { data: list };
  },

  async saveADR(repoId, contextKey, adrData) {
    const record = await repositoryStore.get(repoId).catch(() => null);
    const cacheKey = buildCacheKey(repoId, 'adr', contextKey || adrData.id || adrData.title || '');
    await aiArtifactStore.saveADR(cacheKey, adrData, { analysisVersion: record?.analysisVersion });
    return { data: adrData, cacheKey };
  },

  async deleteADR(cacheKey) {
    await aiArtifactStore.deleteADR(cacheKey);
    return { success: true };
  },

  async getModuleDocumentation(id, path, options = {}) {
    const record = await repositoryStore.get(id);
    if (!record || !record.analysis || !record.analysis.graph) throw new Error('Analysis not available');

    const resolvedPath = (await persistenceStore.resolveFilePath(id, path)) || path;
    const architecture = buildArchitectureModel(record.analysis, record.analysis.graph);
    const context = buildModuleContext(record.analysis, record.analysis.graph, architecture, resolvedPath);

    const cacheKey = buildCacheKey(id, 'module_doc', resolvedPath);
    if (!options.force) {
      try {
        const cached = await aiArtifactStore.get(cacheKey, record.analysisVersion);
        if (cached) {
          return { data: { facts: context, aiInterpretation: cached, fromCache: true } };
        }
      } catch {
        // non-fatal
      }
    }

    if (options.generateAi) {
      const prompt = buildModulePrompt(context);
      const aiResponse = await api.post(`/ai/chat`, { prompt, jsonMode: true });
      let aiInterpretation = null;
      try {
        const raw = (aiResponse.data.response || '')
          .trim()
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/, '')
          .replace(/\s*```$/, '');
        aiInterpretation = JSON.parse(raw);
      } catch (e) {
        console.warn('[getModuleDocumentation] Failed to parse AI JSON:', e.message);
      }

      // ── Store result in cache ────────────────────────────────────────────
      if (aiInterpretation) {
        await aiArtifactStore.set(cacheKey, aiInterpretation, { analysisVersion: record.analysisVersion });
      }

      return { data: { facts: context, aiInterpretation } };
    }

    return { data: { facts: context, aiInterpretation: null } };
  },

  // ── CI / Trigger Endpoints ───────────────────────────────────────────────────
  analyze: async id => {
    await repositoryStore.update(id, { status: 'analyzing', phase: 'extracting', error: null });
    startAnalysis(id, {}).catch(err => console.error('Background analysis failed:', err));
    return { data: { success: true } };
  },
  analyzeIncremental: async id => {
    await repositoryStore.update(id, { status: 'analyzing', phase: 'extracting', error: null });
    startAnalysis(id, {}).catch(err => console.error('Background analysis failed:', err));
    return { data: { success: true } };
  },

  // ── Risk Ignore / Restore API ──────────────────────────────────────────────
  async ignoreRisk(repoId, riskId) {
    await persistenceStore.ignoreRisk(repoId, riskId);
    return { data: { success: true } };
  },
  async restoreRisk(repoId, riskId) {
    await persistenceStore.restoreRisk(repoId, riskId);
    return { data: { success: true } };
  },
  async getIgnoredRiskIds(repoId) {
    const ids = await persistenceStore.getIgnoredRiskIds(repoId);
    return { data: { ids } };
  },
};

export const getAiHealth = () => api.get('/ai/health').then(res => res.data);
export const getAiStatus = () => api.get('/ai/status').then(res => res.data);
export const getEngineeringRisks = id => repositoryApi.getRisks(id).then(res => res.data);
export const getRefactoringIntelligence = id => repositoryApi.getRefactoringIntelligence(id).then(res => res.data);
export const getRefactoringCandidate = (id, candidateId) =>
  repositoryApi.getRefactoringIntelligence(id).then(res => res.data.candidates.find(c => c.id === candidateId));
export const getRefactoringImpact = (id, candidateId) => repositoryApi.getChangeImpact(id).then(res => res.data);
export const autoFixRefactoringCandidate = (id, candidateId, options) =>
  repositoryApi.autoFixRefactoringCandidate(id, candidateId, options).then(res => res.data);
export const applyRefactoringFix = (id, candidateId, filePath, refactoredCode) =>
  repositoryApi.applyRefactoringFix(id, candidateId, filePath, refactoredCode).then(res => res.data);
export const generateTestsRefactoringCandidate = (id, candidateId, options) =>
  repositoryApi.generateTestsRefactoringCandidate(id, candidateId, options).then(res => res.data);

export default api;
