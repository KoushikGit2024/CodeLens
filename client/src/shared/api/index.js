/**
 * index.js (API Bridge)
 *
 * It intercepts frontend data requests, then extracts local IndexedDB payloads, 
 * and then it applies them to the UI or proxies prompts to the Watsonx backend.
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
import { buildEngineeringRiskModel } from '../../services/analyzer/advanced/risk.analyzer.js';
import { buildRefactoringIntelligence } from '../../services/analyzer/advanced/refactoring.analyzer.js';
import { analyzeChangeImpact } from '../../services/analyzer/advanced/change.impact.js';
import { buildQuestionContext } from '../../services/analyzer/advanced/question.context.js';
import { buildPrompt } from '../../services/analyzer/advanced/base.context.js';
import { buildOverviewContext, buildModuleContext, buildOverviewPrompt, buildModulePrompt } from '../../services/analyzer/advanced/documentation.context.js';
import { aiArtifactStore, buildCacheKey } from '../../services/storage/aiArtifact.store.js';

// It initiates the axios instance, then extracts the base configuration, and then it applies a timeout for LLM proxy calls.
const api = axios.create({
  baseURL: import.meta.env.PROD ? import.meta.env.VITE_API_URL : '/api',
  timeout: 60_000,
});
console.log(import.meta.env.PROD ? import.meta.env.VITE_API_URL : '/api')
api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

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
      analysisVersion: 2
    };
    await repositoryStore.set(repoId, record);
    
    try {
      const zip = await JSZip.loadAsync(file);
      const files = Object.keys(zip.files).filter(name => !zip.files[name].dir);
      
      const ignorePatterns = options.ignorePatterns 
        ? options.ignorePatterns.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
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
        const defaultIgnores = ['.git', 'node_modules', 'dist', 'build', 'coverage', '.next', 'out'];
        const pathSegments = filePath.split('/');
        const shouldIgnore = ignorePatterns.some(p => filePath.includes(p)) || 
                             defaultIgnores.some(ignoreDir => pathSegments.includes(ignoreDir));
        
        if (!shouldIgnore) {
          const extMatch = filePath.match(/\.(png|jpe?g|gif|webp|ico|bmp)$/i);
          let content;
          if (extMatch) {
            const ext = extMatch[1].toLowerCase();
            const mimeType = ext === 'jpg' ? 'jpeg' : ext;
            const base64 = await zip.files[originalPath].async('base64');
            content = `data:image/${mimeType};base64,${base64}`;
          } else {
            content = await zip.files[originalPath].async('string');
          }
          await persistenceStore.saveFile(repoId, filePath, content);
        }
        processedCount++;
        if (processedCount % 10 === 0) {
          onProgress({ loaded: 10 + (processedCount / files.length) * 20, total: 100 });
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
    const content = await persistenceStore.loadFile(id, filePath);
    if (content === null) throw new Error('File not found');

    const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
    const EXT_TO_LANG = {
      '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript', '.jsx': 'javascript',
      '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
      '.py': 'python', '.java': 'java',
      '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.h': 'cpp', '.hpp': 'cpp',
      '.go': 'go', '.rs': 'rust', '.c': 'c',
      '.json': 'json', '.md': 'markdown', '.css': 'css',
      '.html': 'html', '.htm': 'html', '.xml': 'xml',
      '.yaml': 'yaml', '.yml': 'yaml', '.sh': 'shell', '.env': 'ini',
    };
    const language = EXT_TO_LANG[ext] || 'plaintext';

    return { data: { content, language } };
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

    const architecture = buildArchitectureModel(record.analysis, graph);
    const engineeringHealth = buildEngineeringRiskModel(record.analysis, graph, architecture);
    
    const fileRisks = engineeringHealth.risks.filter(r => r.file === filePath);
    const hotspot = engineeringHealth.hotspots.find(h => h.file === filePath);
    
    let severity = 'healthy';
    if (fileRisks.some(r => r.severity === 'critical')) severity = 'critical';
    else if (fileRisks.some(r => r.severity === 'high')) severity = 'high';
    else if (fileRisks.some(r => r.severity === 'warning')) severity = 'warning';
      
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
          hotspot: hotspot || null
        }
      } 
    };
  },

  async getArchitecture(id, options = {}) {
    const record = await repositoryStore.get(id);
    if (!record || !record.analysis || !record.analysis.graph) throw new Error('Graph not available');
    const architecture = buildArchitectureModel(record.analysis, record.analysis.graph);
    const health = buildEngineeringRiskModel(record.analysis, record.analysis.graph, architecture);

    architecture.layers.forEach(comp => {
      const compRisks = health.risks.filter(r => comp.data.files?.includes(r.file) || (r.category === 'ARCHITECTURE' && r.evidence?.component === comp.data.label));
      
      let severity = 'healthy';
      if (compRisks.some(r => r.severity === 'critical')) severity = 'critical';
      else if (compRisks.some(r => r.severity === 'high')) severity = 'high';
      else if (compRisks.some(r => r.severity === 'warning')) severity = 'warning';

      comp.health = {
        severity,
        risks: compRisks
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

    if (options.generateAi) {
      const prompt = `You are a software architect analyzing a codebase.
Provide a clear, 2-3 paragraph architectural evaluation based on these metrics.

Components: ${model.components.map(c => c.data.label).join(', ')}
Total Relations: ${model.relations.length}
Boundary Violations: ${model.violations.length}
Entry Points: ${model.entryPoints.join(', ')}

Evaluate the modularity, coupling, and any apparent risks based on the violations.`;

      const aiResponse = await api.post('/ai/chat', { prompt, jsonMode: true });
      let insights = null;
      try {
        const raw = (aiResponse.data.response || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
        insights = JSON.parse(raw);
      } catch (e) {
        insights = { summary: aiResponse.data.response };
      }
      return { data: { model, insights } };
    }

    return { data: { model } };
  },

  async getIntelligence(repoId, options = {}) {
    const record = await repositoryStore.get(repoId);
    if (!record || !record.analysis || !record.analysis.graph) throw new Error('Graph not available');
    
    const architecture = buildArchitectureModel(record.analysis, record.analysis.graph);
    const intelligence = buildRepositoryIntelligence(record.analysis, record.analysis.graph, architecture);

    if (options.generateAi) {
      const langs = Object.entries(intelligence.repository.languages || {})
        .sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([l, n]) => `${l} (${n} files)`).join(', ');

      const hotspotList = (intelligence.hotspots || []).slice(0, 5)
        .map(h => `  - ${h.filePath} (hotspot score: ${h.score})`).join('\n');

      const topCandidates = (intelligence.refactoring.topCandidates || [])
        .map(c => `  - ${c.title} [${c.priority}]`).join('\n');

      const prompt = `You are CodeLens, a senior software architect and code intelligence assistant.
Analyze the following deterministic repository metrics and produce a clear, concise, high-level overview.

REPOSITORY: ${intelligence.repository.name}
FILES: ${intelligence.repository.fileCount} source files
LANGUAGES: ${langs}

ARCHITECTURE:
- ${intelligence.architecture.components} detected components
- Layers: ${(intelligence.architecture.layers || []).join(', ') || 'N/A'}

DEPENDENCY GRAPH:
- ${intelligence.dependencies.nodes} nodes, ${intelligence.dependencies.edges} edges
- Circular dependencies: ${intelligence.dependencies.cycles}

ENGINEERING HEALTH:
- Overall score: ${intelligence.engineeringHealth.score}/100
- Critical issues: ${intelligence.engineeringHealth.critical}
- High-severity issues: ${intelligence.engineeringHealth.high}
- Warnings: ${intelligence.engineeringHealth.warnings}

REFACTORING:
- ${intelligence.refactoring.candidateCount} candidate(s) identified (${intelligence.refactoring.critical} critical, ${intelligence.refactoring.high} high)
- Top candidates:
${topCandidates || '  None'}

TOP HOTSPOT FILES:
${hotspotList || '  None identified'}

Provide a 3-5 paragraph technical summary covering: overall codebase health, main architectural observations, key risks to address, and recommended immediate actions.`;

      const aiResponse = await api.post('/ai/chat', { prompt });
      const insights = {
        summary: aiResponse.data.response,
        facts: [
          `${intelligence.repository.fileCount} files analyzed across ${intelligence.architecture.components} architectural component(s)`,
          `${intelligence.dependencies.nodes} nodes, ${intelligence.dependencies.edges} edges in the dependency graph`,
          intelligence.dependencies.cycles > 0
            ? `${intelligence.dependencies.cycles} circular dependency cycle(s) detected — requires attention`
            : 'No circular dependencies detected',
          `Engineering health score: ${intelligence.engineeringHealth.score}/100 (${intelligence.engineeringHealth.critical} critical, ${intelligence.engineeringHealth.high} high issues)`,
          `${intelligence.refactoring.candidateCount} refactoring candidate(s) identified`,
        ],
        references: (intelligence.hotspots || []).slice(0, 5).map(h => h.filePath)
      };
      return { data: { intelligence, insights } };
    }

    return { data: { intelligence } };
  },

  async getRisks(repoId, options = {}) {
    const record = await repositoryStore.get(repoId);
    if (!record || !record.analysis || !record.analysis.graph) throw new Error('Graph not available');
    const architecture = buildArchitectureModel(record.analysis, record.analysis.graph);
    const risks = buildEngineeringRiskModel(record.analysis, record.analysis.graph, architecture);

    if (options.generateAi) {
      const prompt = `You are a senior technical lead reviewing engineering health metrics.
Overall Score: ${risks.score}
Critical Risks: ${risks.risks.filter(r => r.severity === 'critical').length}
High Risks: ${risks.risks.filter(r => r.severity === 'high').length}
Total Hotspots: ${risks.hotspots.length}

Please provide a 2-3 paragraph interpretation of these metrics, highlighting what the most critical areas of concern might be and what a general mitigation strategy should look like.
Format the output as JSON with the following structure:
{
  "summary": "High level interpretation text",
  "limitations": "Potential limitations or risks text"
}`;
      const aiResponse = await api.post('/ai/chat', { prompt, jsonMode: true });
      let insights = null;
      try {
        const raw = (aiResponse.data.response || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
        insights = JSON.parse(raw);
      } catch (e) {
        insights = { summary: aiResponse.data.response };
      }
      return { data: { ...risks, insights } };
    }

    return { data: risks };
  },

  async getRefactoringInsights(repoId, candidateId) {
    const record = await repositoryStore.get(repoId);
    if (!record || !record.analysis || !record.analysis.graph) throw new Error('Graph not available');
    const architecture = buildArchitectureModel(record.analysis, record.analysis.graph);
    const risks = buildEngineeringRiskModel(record.analysis, record.analysis.graph, architecture);
    const refactoring = buildRefactoringIntelligence(risks, record.analysis, record.analysis.graph);
    
    const candidate = refactoring.candidates.find(c => c.id === candidateId);
    if (!candidate) throw new Error('Candidate not found');

    const prompt = `You are an expert software architect. Analyze the following refactoring candidate and provide a detailed strategy.
Title: ${candidate.title}
Summary: ${candidate.summary}
Affected Files: ${candidate.files?.join(', ')}
Severity: ${candidate.severity}

Generate a structured JSON response matching this exact schema:
{
  "summary": "A 1-paragraph summary of the approach",
  "recommendations": [
    {
      "strategy": "Name of the strategy",
      "reasoning": "Why this is recommended",
      "steps": ["Step 1", "Step 2"]
    }
  ],
  "limitations": ["Risk 1", "Limitation 1"]
}`;

    const res = await api.post('/ai/chat', { prompt, jsonMode: true });
    let insights;
    try {
      const raw = (res.data.response || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
      insights = JSON.parse(raw);
    } catch (e) {
      throw new Error('Failed to parse AI response as JSON.');
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

  async autoFixRefactoringCandidate(repoId, candidateId) {
    const record = await repositoryStore.get(repoId);
    if (!record || !record.analysis || !record.analysis.graph) throw new Error('Graph not available');
    
    const architecture = buildArchitectureModel(record.analysis, record.analysis.graph);
    const risks = buildEngineeringRiskModel(record.analysis, record.analysis.graph, architecture);
    const refactoring = buildRefactoringIntelligence(risks, record.analysis, record.analysis.graph);
    
    const candidate = refactoring.candidates.find(c => c.id === candidateId);
    if (!candidate) throw new Error('Candidate not found');
    if (!candidate.files || candidate.files.length === 0) throw new Error('No files associated with this candidate');
    
    const targetFile = candidate.files[0];
    const originalCode = await persistenceStore.loadFile(repoId, targetFile);
    if (!originalCode) throw new Error(`Could not load source file ${targetFile}`);
    
    const strategiesText = candidate.suggestedStrategies?.map(s => `- ${s.action}: ${s.description}`).join('\n') || 'Improve code quality and structure.';
    
    const prompt = `You are an expert AI software architect. Please refactor the following file to resolve the issue: "${candidate.title}".
Category: ${candidate.type}
Description: ${candidate.summary}

Recommended Strategies:
${strategiesText}

Please provide ONLY the fully refactored source code inside a markdown code block (e.g. \`\`\`javascript ... \`\`\`). Do not include explanations outside the code block.

File: ${targetFile}
Original Code:
\`\`\`
${originalCode}
\`\`\`
`;

    const res = await api.post(`/ai/chat`, { prompt });
    const responseText = res.data?.response || res.data || '';
    
    let refactoredCode = responseText;
    const codeBlockMatch = responseText.match(/```[a-z]*\n([\s\S]*?)\n```/);
    if (codeBlockMatch) {
      refactoredCode = codeBlockMatch[1];
    } else {
      refactoredCode = responseText;
    }

    return { data: { originalCode, refactoredCode, file: targetFile } };
  },

  // ── AI Prompt Endpoints ──────────────────────────────────────────────────────
  /**
   * It maps the active file context, then extracts local database loaders, 
   * and then it applies the context builder to proxy structured prompts to the LLM.
   */
  async askQuestion(id, question, activeContext, history = []) {
    const record = await repositoryStore.get(id);
    if (!record || !record.analysis || !record.analysis.graph) throw new Error('Analysis not available');

    // On follow-up turns, skip the expensive context rebuild entirely.
    // The server-side formatWithHistory() will prepend prior turns so the model
    // already has grounding — re-scoring every file on each message is pure waste.
    const isFirstTurn = !history || history.length === 0;

    if (!isFirstTurn) {
      return api.post(`/ai/chat`, { prompt: question, history });
    }

    // First turn only: build full deterministic context and attach it to the prompt.
    const fileLoaderCallback = (path) => persistenceStore.loadFile(id, path);
    const { contextData } = await buildQuestionContext(record.analysis, question, fileLoaderCallback, activeContext);
    
    const promptContext = {
       question,
       repository: contextData.meta,
       files: contextData.files,
       truncated: false
    };
    const rawPrompt = buildPrompt(promptContext);
    
    const fullPrompt = contextData.facts.length > 0 
      ? `Facts:\n${contextData.facts.join('\n')}\n\n${rawPrompt}` 
      : rawPrompt;

    return api.post(`/ai/chat`, { prompt: fullPrompt, history });
  },

  async getOverviewDocumentation(id, options = {}) {
    const record = await repositoryStore.get(id);
    if (!record || !record.analysis || !record.analysis.graph) throw new Error('Analysis not available');

    const architecture = buildArchitectureModel(record.analysis, record.analysis.graph);
    const context = buildOverviewContext(record.analysis, record.analysis.graph, architecture);

    if (options.generateAi) {
      const prompt = buildOverviewPrompt(context);
      const aiResponse = await api.post(`/ai/chat`, { prompt, jsonMode: true });
      let aiInterpretation = null;
      try {
        // The server's ai.service.js already strips fences and parses JSON when jsonMode=true,
        // but the response is re-serialised as a string to keep the client contract uniform.
        const raw = (aiResponse.data.response || '').trim()
          .replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
        aiInterpretation = JSON.parse(raw);
      } catch (e) {
        console.warn('[getOverviewDocumentation] Failed to parse AI JSON:', e.message);
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

    const prompt = `You are a Principal Software Architect. Given the following engineering/architecture finding, draft an Architecture Decision Record (ADR) that addresses this issue.

Context:
Title: ${findingContext.title}
Category: ${findingContext.category}
Severity: ${findingContext.severity}
Description: ${findingContext.description}
File/Evidence: ${findingContext.file || findingContext.evidence || 'N/A'}

Produce a structured JSON response matching this exact schema:
{
  "title": "A short, concise title for the ADR",
  "status": "Proposed",
  "context": "Background and description of the current situation and the finding.",
  "decision": "The proposed change or decision to resolve the issue.",
  "consequences": "Positive and negative consequences of this decision.",
  "alternatives": "Other options that were considered and why they were rejected.",
  "evidence": "References to the specific finding, file, or architectural rule."
}`;

    const aiResponse = await api.post('/ai/chat', { prompt, jsonMode: true });
    let adr = null;
    try {
      const raw = (aiResponse.data.response || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
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
  
  async getModuleDocumentation(id, path, options = {}) {
    const record = await repositoryStore.get(id);
    if (!record || !record.analysis || !record.analysis.graph) throw new Error('Analysis not available');

    const architecture = buildArchitectureModel(record.analysis, record.analysis.graph);
    const context = buildModuleContext(record.analysis, record.analysis.graph, architecture, path);

    if (options.generateAi) {
      // ── Cache check (before calling the AI proxy) ────────────────────────
      const cacheKey = buildCacheKey(id, 'module_doc', path);
      const cached = await aiArtifactStore.get(cacheKey, record.analysisVersion);
      if (cached) {
        return { data: { facts: context, aiInterpretation: cached, fromCache: true } };
      }

      const prompt = buildModulePrompt(context);
      const aiResponse = await api.post(`/ai/chat`, { prompt, jsonMode: true });
      let aiInterpretation = null;
      try {
        const raw = (aiResponse.data.response || '').trim()
          .replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
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
};

export const getAiHealth = () => api.get('/ai/health').then(res => res.data);
export const getAiStatus = () => api.get('/ai/status').then(res => res.data);
export const getEngineeringRisks = (id) => repositoryApi.getRisks(id).then(res => res.data);
export const getRefactoringIntelligence = (id) => repositoryApi.getRefactoringIntelligence(id).then(res => res.data);
export const getRefactoringCandidate = (id, candidateId) => repositoryApi.getRefactoringIntelligence(id).then(res => res.data.candidates.find(c => c.id === candidateId));
export const getRefactoringImpact = (id, candidateId) => repositoryApi.getChangeImpact(id).then(res => res.data);
export const autoFixRefactoringCandidate = (id, candidateId) => repositoryApi.autoFixRefactoringCandidate(id, candidateId).then(res => res.data);

export default api;