/**
 * refactoring.analyzer.js
 *
 * Evaluates engineering risks, calculates deterministic priority scores,
 * constructs internal symbol dependency graphs, computes LCOM4 cohesion metrics,
 * and generates automated file decomposition blueprints.
 */

import { SEVERITY } from './risk.analyzer.js';
import { getStrategiesForRisk } from './refactoring.strategies.js';
import { analyzeChangeImpact } from './change.impact.js';

const SEVERITY_MULTIPLIER = {
  [SEVERITY.CRITICAL]: 3.0,
  [SEVERITY.HIGH]: 2.0,
  [SEVERITY.WARNING]: 1.0,
};

/**
 * Maps risk categories to priority weight multipliers.
 */
function estimateImpactMultiplier(riskCategory) {
  switch (riskCategory) {
    case 'DEPENDENCY':
      return 3.0;
    case 'ARCHITECTURE':
      return 2.5;
    case 'COUPLING':
      return 2.0;
    case 'COHESION':
      return 2.0;
    case 'SIZE':
      return 1.5;
    default:
      return 1.0;
  }
}

/**
 * Determines a heuristic confidence rating and label from risk attributes.
 */
function determineConfidence(risk) {
  if (risk.title.includes('Circular Dependency')) return { score: 1.0, label: 'high' };
  if (risk.title.includes('Cross-Layer Violation')) return { score: 0.9, label: 'high' };
  if (risk.title.includes('Very large file')) return { score: 0.9, label: 'high' };
  if (risk.title.includes('Low Cohesion') || risk.title.includes('LCOM4')) return { score: 0.85, label: 'high' };
  if (risk.title.includes('Unresolved Dependencies')) return { score: 0.8, label: 'high' };
  if (risk.title.includes('Large file')) return { score: 0.7, label: 'medium' };
  if (risk.title.includes('fan-out')) return { score: 0.7, label: 'medium' };

  if (risk.title.includes('fan-in')) return { score: 0.5, label: 'low' };
  if (risk.title.includes('Isolated Module')) return { score: 0.3, label: 'low' };

  return { score: 0.5, label: 'medium' };
}

/**
 * Processes the risk object and generates a normalized 1-100 priority score.
 */
export function calculatePriority(risk) {
  const severityMultiplier = SEVERITY_MULTIPLIER[risk.severity] || 1.0;
  const impactMultiplier = estimateImpactMultiplier(risk.category);
  const confidence = determineConfidence(risk);

  const rawScore = severityMultiplier * impactMultiplier * confidence.score * 11;
  const priorityScore = Math.min(100, Math.round(rawScore));

  let priorityLabel = 'warning';
  if (priorityScore >= 80) priorityLabel = 'critical';
  else if (priorityScore >= 50) priorityLabel = 'high';

  let impactLabel = 'low';
  if (impactMultiplier >= 2.5) impactLabel = 'high';
  else if (impactMultiplier >= 1.5) impactLabel = 'medium';

  return {
    priorityScore,
    priority: priorityLabel,
    impact: impactLabel,
    confidence: confidence.label,
    rawConfidence: confidence.score,
  };
}

/**
 * Extracts file references and line ranges from a risk finding.
 */
function extractFilesAndRangesFromRisk(risk) {
  const files = new Set();
  const fileRanges = {};

  if (risk.file) files.add(risk.file);

  if (risk.evidence) {
    if (risk.evidence.cyclePath) {
      risk.evidence.cyclePath.forEach(f => files.add(f));
    }
    if (risk.evidence.sourceComp && risk.evidenceFile) {
      files.add(risk.evidenceFile);
    }

    if (risk.evidence.location && risk.file) {
      fileRanges[risk.file] = {
        startLine: risk.evidence.location.startLine,
        endLine: risk.evidence.location.endLine,
      };
    }

    if (risk.evidence.instances) {
      risk.evidence.instances.forEach(instance => {
        files.add(instance.filePath);
        if (instance.location) {
          fileRanges[instance.filePath] = {
            startLine: instance.location.startLine,
            endLine: instance.location.endLine,
          };
        }
      });
    }

    if (risk.evidence.lineCount && risk.file && !fileRanges[risk.file]) {
      fileRanges[risk.file] = {
        startLine: 1,
        endLine: risk.evidence.lineCount,
      };
    }
  }
  return { files: Array.from(files), fileRanges };
}

// ─────────────────────────────────────────────────────────────────────────────
// LCOM4 & Cohesion Decomposition Engine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Standard archetypes for classifying cohesive method clusters into target modules.
 */
export const ARCHETYPE_ROLES = {
  DATA_ACCESS: {
    role: 'Data Access & Network',
    suffix: '.service',
    keywords: [
      'fetch',
      'get',
      'post',
      'put',
      'delete',
      'query',
      'find',
      'load',
      'request',
      'save',
      'db',
      'client',
      'http',
      'api',
      'sync',
      'download',
      'upload',
      'endpoint',
      'axios',
      'storage',
      'read',
      'write',
      'store',
    ],
    rationale: 'Encapsulates data fetching, persistence, and external network interactions.',
  },
  FORMATTERS: {
    role: 'Formatting & Transformations',
    suffix: '.formatters',
    keywords: [
      'format',
      'parse',
      'convert',
      'serialize',
      'deserialize',
      'sanitize',
      'transform',
      'to',
      'normalize',
      'print',
      'stringify',
      'truncate',
      'encode',
      'decode',
      'pretty',
      'slugify',
    ],
    rationale: 'Pure data transformation and formatting utilities with zero side effects.',
  },
  VALIDATORS: {
    role: 'Validation & Contracts',
    suffix: '.validators',
    keywords: [
      'validate',
      'check',
      'is',
      'has',
      'assert',
      'verify',
      'schema',
      'ensure',
      'match',
      'detect',
      'can',
      'should',
      'test',
      'rule',
    ],
    rationale: 'Input sanitization, schema validation rules, and contract enforcement.',
  },
  PRESENTATION: {
    role: 'Presentation & UI',
    suffix: '.component',
    keywords: [
      'render',
      'view',
      'component',
      'use',
      'hook',
      'card',
      'modal',
      'button',
      'screen',
      'page',
      'draw',
      'layout',
      'paint',
      'display',
      'badge',
      'icon',
      'style',
      'header',
      'footer',
    ],
    rationale: 'User interface components, templates, and view rendering logic.',
  },
  STATE_HANDLERS: {
    role: 'State & Event Handlers',
    suffix: '.handlers',
    keywords: [
      'handle',
      'on',
      'dispatch',
      'action',
      'reducer',
      'event',
      'mutate',
      'emit',
      'listen',
      'trigger',
      'callback',
      'click',
      'change',
      'submit',
      'press',
    ],
    rationale: 'Event handling, action dispatching, and state machine transitions.',
  },
  CORE_DOMAIN: {
    role: 'Core Domain & Orchestration',
    suffix: '.core',
    keywords: [
      'process',
      'execute',
      'calculate',
      'compute',
      'evaluate',
      'orchestrate',
      'manager',
      'coordinator',
      'pipeline',
      'engine',
      'run',
      'main',
    ],
    rationale: 'High-level business rules and primary workflow coordination.',
  },
};

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'get',
  'set',
  'let',
  'var',
  'const',
  'func',
  'function',
  'class',
  'method',
  'arrow',
  'item',
  'data',
  'info',
  'object',
  'value',
  'type',
  'result',
  'temp',
  'param',
  'params',
  'args',
]);

const ACTION_VERBS = new Set([
  'fetch',
  'get',
  'set',
  'save',
  'update',
  'delete',
  'create',
  'remove',
  'add',
  'format',
  'parse',
  'convert',
  'render',
  'handle',
  'on',
  'process',
  'check',
  'validate',
  'make',
  'build',
  'show',
  'hide',
  'open',
  'close',
  'init',
  'start',
  'stop',
  'reset',
]);

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Tokenizes identifier into lowercase semantic word stems.
 */
export function tokenizeIdentifier(name) {
  if (!name || typeof name !== 'string') return [];
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_\-0-9]+/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));
}

/**
 * Constructs an internal symbol graph G = (V, E) where nodes are callable symbols
 * and edges represent direct invocations, shared state, or parameter domain affinity.
 */
export function buildSymbolGraph(symbols, fileContent = '') {
  if (!Array.isArray(symbols)) return { nodes: [], edges: [], adjacency: new Map() };

  // Filter callable or structural symbols
  const eligibleKinds = new Set(['function', 'arrow', 'method', 'class']);
  const nodes = symbols.filter(s => s && s.name && (eligibleKinds.has(s.kind) || !s.kind));

  const adjacency = new Map();
  nodes.forEach(n => adjacency.set(n.name, new Set()));

  if (nodes.length < 2) {
    return { nodes, edges: [], adjacency };
  }

  const edges = [];
  const addEdge = (u, v, reason) => {
    if (u === v) return;
    if (!adjacency.get(u).has(v)) {
      adjacency.get(u).add(v);
      adjacency.get(v).add(u);
      edges.push({ source: u, target: v, reason });
    }
  };

  const nodeMeta = nodes.map(node => {
    const tokens = new Set(tokenizeIdentifier(node.name));
    const params = new Set(
      Array.isArray(node.params)
        ? node.params
            .map(p => (typeof p === 'string' ? p : p?.name || ''))
            .filter(p => p && p.length > 1 && !['e', 'i', '_', 'err', 'req', 'res'].includes(p))
        : []
    );
    return { node, tokens, params };
  });

  const lines = typeof fileContent === 'string' && fileContent ? fileContent.split('\n') : null;

  for (let i = 0; i < nodes.length; i++) {
    const metaA = nodeMeta[i];
    const nameA = metaA.node.name;

    let bodySnippetA = '';
    if (lines && metaA.node.location?.startLine && metaA.node.location?.endLine) {
      const s = Math.max(0, metaA.node.location.startLine - 1);
      const e = Math.min(lines.length, metaA.node.location.endLine);
      bodySnippetA = lines.slice(s, e).join('\n');
    }

    for (let j = i + 1; j < nodes.length; j++) {
      const metaB = nodeMeta[j];
      const nameB = metaB.node.name;

      let connected = false;

      // 1. Direct call reference in body of A to B
      if (bodySnippetA && nameB.length > 2) {
        const callRegex = new RegExp(`\\b${escapeRegex(nameB)}\\s*\\(`);
        if (callRegex.test(bodySnippetA)) {
          addEdge(nameA, nameB, 'call_reference');
          connected = true;
        }
      }

      // 2. Direct call in body of B to A
      if (!connected && lines && metaB.node.location?.startLine && metaB.node.location?.endLine) {
        const sB = Math.max(0, metaB.node.location.startLine - 1);
        const eB = Math.min(lines.length, metaB.node.location.endLine);
        const bodySnippetB = lines.slice(sB, eB).join('\n');
        const callRegexA = new RegExp(`\\b${escapeRegex(nameA)}\\s*\\(`);
        if (callRegexA.test(bodySnippetB)) {
          addEdge(nameA, nameB, 'call_reference');
          connected = true;
        }
      }

      // 3. Shared Parameter Co-occurrence
      if (!connected && metaA.params.size > 0 && metaB.params.size > 0) {
        let sharedParamCount = 0;
        for (const p of metaA.params) {
          if (metaB.params.has(p)) sharedParamCount++;
        }
        if (sharedParamCount >= 2 || (sharedParamCount >= 1 && (metaA.params.size <= 2 || metaB.params.size <= 2))) {
          addEdge(nameA, nameB, 'shared_parameters');
          connected = true;
        }
      }

      // 4. Shared Lexical Domain Tokens (e.g. userProfile / userAddress)
      if (!connected && metaA.tokens.size > 0 && metaB.tokens.size > 0) {
        let sharedDomainTokens = 0;
        for (const t of metaA.tokens) {
          if (metaB.tokens.has(t) && !ACTION_VERBS.has(t)) {
            sharedDomainTokens++;
          }
        }
        if (sharedDomainTokens >= 1) {
          addEdge(nameA, nameB, 'shared_domain_concept');
          connected = true;
        }
      }
    }
  }

  return { nodes, edges, adjacency };
}

/**
 * Computes the Lack of Cohesion of Methods (LCOM4) metric.
 * Returns the count of connected components in the symbol dependency graph.
 * - LCOM4 = 1: High cohesion (single interconnected responsibility).
 * - LCOM4 = 2: Moderate cohesion (two distinct functional clusters).
 * - LCOM4 >= 3: Low cohesion (splittable multi-responsibility module).
 */
export function calculateLCOM4(symbols, fileContent = '') {
  const { nodes, adjacency } = buildSymbolGraph(symbols, fileContent);
  if (nodes.length === 0) return 0;
  if (nodes.length === 1) return 1;

  const visited = new Set();
  let componentCount = 0;

  for (const node of nodes) {
    if (!visited.has(node.name)) {
      componentCount++;
      const queue = [node.name];
      visited.add(node.name);

      while (queue.length > 0) {
        const curr = queue.shift();
        const neighbors = adjacency.get(curr) || new Set();
        for (const n of neighbors) {
          if (!visited.has(n)) {
            visited.add(n);
            queue.push(n);
          }
        }
      }
    }
  }

  return componentCount;
}

/**
 * Groups symbols into cohesive connected components and classifies their architectural archetype.
 */
export function clusterSymbolsByCohesion(symbols, fileContent = '', originalPath = '') {
  const { nodes, adjacency } = buildSymbolGraph(symbols, fileContent);
  if (nodes.length === 0) return [];

  const visited = new Set();
  const rawClusters = [];

  for (const node of nodes) {
    if (!visited.has(node.name)) {
      const clusterNodes = [node];
      visited.add(node.name);
      const queue = [node.name];

      while (queue.length > 0) {
        const curr = queue.shift();
        const neighbors = adjacency.get(curr) || new Set();
        for (const neighborName of neighbors) {
          if (!visited.has(neighborName)) {
            visited.add(neighborName);
            queue.push(neighborName);
            const neighborNode = nodes.find(n => n.name === neighborName);
            if (neighborNode) clusterNodes.push(neighborNode);
          }
        }
      }

      rawClusters.push(clusterNodes);
    }
  }

  const ext = originalPath && originalPath.includes('.') ? '.' + originalPath.split('.').pop() : '.js';

  return rawClusters.map((clusterNodes, index) => {
    const scores = {
      DATA_ACCESS: 0,
      FORMATTERS: 0,
      VALIDATORS: 0,
      PRESENTATION: 0,
      STATE_HANDLERS: 0,
      CORE_DOMAIN: 0,
    };

    clusterNodes.forEach(n => {
      const lower = (n.name || '').toLowerCase();
      for (const [key, meta] of Object.entries(ARCHETYPE_ROLES)) {
        for (const kw of meta.keywords) {
          if (lower.includes(kw)) {
            scores[key] += 1;
          }
        }
      }
    });

    let bestRoleKey = 'CORE_DOMAIN';
    let maxScore = 0;
    for (const [key, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        bestRoleKey = key;
      }
    }

    const archetype = ARCHETYPE_ROLES[bestRoleKey] || ARCHETYPE_ROLES.CORE_DOMAIN;

    let lineCountEstimate = 0;
    clusterNodes.forEach(n => {
      if (n.location?.startLine && n.location?.endLine) {
        lineCountEstimate += Math.max(1, n.location.endLine - n.location.startLine + 1);
      } else {
        lineCountEstimate += 25;
      }
    });

    let targetFileName = '';
    const cleanOrig = originalPath || 'module.js';
    if (rawClusters.length === 1) {
      targetFileName = cleanOrig.split('/').pop() || 'module' + ext;
    } else if (index === 0 && bestRoleKey === 'CORE_DOMAIN') {
      targetFileName = cleanOrig.split('/').pop() || 'index' + ext;
    } else {
      const baseName = cleanOrig
        .split('/')
        .pop()
        .replace(/\.[^/.]+$/, '');
      targetFileName = `${baseName}${archetype.suffix}${ext}`;
    }

    const targetPath = cleanOrig.includes('/')
      ? `${cleanOrig.substring(0, cleanOrig.lastIndexOf('/'))}/${targetFileName}`
      : targetFileName;

    return {
      id: `cluster-${index + 1}`,
      role: archetype.role,
      roleKey: bestRoleKey,
      suffix: archetype.suffix,
      targetFileName,
      targetPath,
      symbols: clusterNodes.map(n => n.name),
      symbolCount: clusterNodes.length,
      lineCountEstimate,
      rationale: archetype.rationale,
      symbolsList: clusterNodes.map(n => ({
        name: n.name,
        kind: n.kind,
        complexity: n.complexity || 1,
        cognitiveComplexity: n.cognitiveComplexity || 0,
        startLine: n.location?.startLine,
        endLine: n.location?.endLine,
      })),
    };
  });
}

/**
 * Generates an automated file decomposition blueprint with concrete split targets and migration steps.
 */
export function generateDecompositionBlueprint(fileAnalysis, options = {}) {
  if (!fileAnalysis) return null;

  const symbols = fileAnalysis.symbols || [];
  const filePath = fileAnalysis.filePath || options.filePath || 'module.js';
  const fileContent = options.content || fileAnalysis.content || '';

  const lcom4 = calculateLCOM4(symbols, fileContent);
  const clusters = clusterSymbolsByCohesion(symbols, fileContent, filePath);

  let cohesionRating = 'High';
  if (lcom4 >= 3) cohesionRating = 'Low (Splittable)';
  else if (lcom4 === 2) cohesionRating = 'Moderate';

  const migrationSteps = [];
  if (clusters.length > 1) {
    clusters.forEach(cl => {
      if (cl.targetPath !== filePath) {
        migrationSteps.push(
          `Extract ${cl.symbols.length} ${cl.role} symbol(s) (${cl.symbols.slice(0, 3).join(', ')}${cl.symbols.length > 3 ? '...' : ''}) into dedicated file \`${cl.targetFileName}\`.`
        );
      }
    });
    migrationSteps.push(
      `Re-export extracted symbols from \`${filePath.split('/').pop()}\` or update downstream import statements to preserve public contracts.`
    );
    migrationSteps.push(`Run automated test suite to verify zero functional regressions.`);
  } else {
    migrationSteps.push(`Module is cohesive (LCOM4 = ${lcom4}). No file splitting necessary.`);
  }

  return {
    originalFile: filePath,
    lcom4,
    cohesionRating,
    totalSymbols: symbols.length,
    clusterCount: clusters.length,
    clusters,
    migrationSteps,
  };
}

/**
 * Parses the engineering risk model and repository analysis to build prioritized refactoring candidates
 * enriched with LCOM4 cohesion decomposition blueprints.
 */
export function buildRefactoringIntelligence(engineeringRiskModel, analysis, graph) {
  const candidates = [];

  if (!engineeringRiskModel?.risks) {
    return {
      summary: 'No risks provided.',
      candidateCount: 0,
      critical: 0,
      high: 0,
      topPriorityScore: 0,
      candidates: [],
    };
  }

  for (const risk of engineeringRiskModel.risks) {
    if (risk.title.includes('Unresolved Dependencies')) continue;

    const priorityInfo = calculatePriority(risk);
    const { files: affectedFiles, fileRanges } = extractFilesAndRangesFromRisk(risk);

    // Compute decomposition blueprint if candidate represents a splittable unit
    let decompositionBlueprint = null;
    let fileAnalysis = null;
    const targetFilePath = risk.file || (affectedFiles.length > 0 ? affectedFiles[0] : null);
    if (targetFilePath && analysis?.files) {
      fileAnalysis = analysis.files.find(f => f.filePath === targetFilePath);
      if (fileAnalysis && Array.isArray(fileAnalysis.symbols) && fileAnalysis.symbols.length >= 2) {
        const isDecompositionCandidate =
          risk.category === 'SIZE' ||
          risk.category === 'COUPLING' ||
          risk.category === 'COHESION' ||
          risk.title.includes('Complexity') ||
          risk.title.includes('file') ||
          risk.title.includes('Hotspot') ||
          risk.title.includes('fan-out');

        if (isDecompositionCandidate) {
          decompositionBlueprint = generateDecompositionBlueprint(fileAnalysis);
        }
      }
    }

    const strategies = getStrategiesForRisk(risk, {
      fileAnalysis,
      blueprint: decompositionBlueprint,
      affectedFiles,
    });

    const idString = `${risk.title}|${risk.category}|${affectedFiles.join(',')}`;

    let hash = 0;
    for (let i = 0; i < idString.length; i++) {
      hash = (hash << 5) - hash + idString.charCodeAt(i);
      hash |= 0;
    }
    const deterministicId = Math.abs(hash).toString(16).padEnd(12, '0').substring(0, 12);

    let summaryText = risk.description;
    if (decompositionBlueprint && decompositionBlueprint.clusters?.length > 1) {
      const uniqueRoles = [...new Set(decompositionBlueprint.clusters.map(c => c.role).filter(Boolean))];
      const roleText = uniqueRoles.length > 0 ? uniqueRoles.slice(0, 3).join(', ') : 'Multiple Responsibilities';
      summaryText = `File \`${targetFilePath}\` has low cohesion (LCOM4 = ${decompositionBlueprint.lcom4}). Its ${decompositionBlueprint.totalSymbols} symbols divide into ${decompositionBlueprint.clusterCount} single-purpose modules (${roleText}).`;
    }

    const candidate = {
      id: deterministicId,
      type: risk.category,
      title: risk.title,
      priority: priorityInfo.priority,
      priorityScore: priorityInfo.priorityScore,
      severity: risk.severity,
      confidence: priorityInfo.confidence,

      summary: summaryText,
      mainFile: risk.file || null,
      files: affectedFiles,
      fileRanges: fileRanges,
      evidence: risk.evidence,

      suggestedStrategies: strategies,
      decompositionBlueprint,

      estimatedScope: (() => {
        let direct = affectedFiles.length;
        let downstream = 0;
        if (analysis && graph && affectedFiles.length > 0) {
          try {
            const impact = analyzeChangeImpact(analysis, graph, affectedFiles);
            downstream = impact.transitivelyAffectedFiles.length;
          } catch (e) {
            console.warn('[refactoring.analyzer] Failed to calculate impact for refactoring candidate');
          }
        }
        return {
          fileCount: direct,
          downstreamImpact: downstream,
        };
      })(),
    };

    candidates.push(candidate);
  }

  // Detect un-flagged low cohesion files (LCOM4 >= 3 with >= 6 symbols)
  if (analysis?.files) {
    const existingMainFiles = new Set(candidates.map(c => c.mainFile).filter(Boolean));
    for (const fileAnalysis of analysis.files) {
      if (!fileAnalysis.filePath || existingMainFiles.has(fileAnalysis.filePath)) continue;

      const pathLower = fileAnalysis.filePath.toLowerCase();
      if (
        pathLower.includes('.test.') ||
        pathLower.includes('.spec.') ||
        pathLower.includes('/test/') ||
        pathLower.includes('/tests/') ||
        pathLower.includes('config')
      ) {
        continue;
      }

      if (Array.isArray(fileAnalysis.symbols) && fileAnalysis.symbols.length >= 6) {
        const blueprint = generateDecompositionBlueprint(fileAnalysis);
        if (blueprint && blueprint.lcom4 >= 3 && blueprint.clusterCount >= 3) {
          const lcomRisk = {
            category: 'SIZE',
            title: `Low Cohesion / Multi-Responsibility Module (LCOM4: ${blueprint.lcom4})`,
            description: `File \`${fileAnalysis.filePath}\` contains ${blueprint.clusterCount} disconnected method clusters that do not share state or call each other, indicating poor encapsulation.`,
            severity: blueprint.lcom4 >= 4 ? SEVERITY.HIGH : SEVERITY.WARNING,
            file: fileAnalysis.filePath,
            evidence: {
              lcom4: blueprint.lcom4,
              clusterCount: blueprint.clusterCount,
              lineCount: fileAnalysis.lineCount || 0,
              cohesionRating: blueprint.cohesionRating,
            },
          };

          const pInfo = calculatePriority(lcomRisk);
          const { files: affFiles, fileRanges: fRanges } = extractFilesAndRangesFromRisk(lcomRisk);
          const strategies = getStrategiesForRisk(lcomRisk, {
            fileAnalysis,
            blueprint,
            affectedFiles: affFiles,
          });

          let h = 0;
          for (let i = 0; i < fileAnalysis.filePath.length; i++) {
            h = (h << 5) - h + fileAnalysis.filePath.charCodeAt(i);
            h |= 0;
          }
          const detId = `lcom4_${Math.abs(h).toString(16).padEnd(8, '0').slice(0, 8)}`;

          candidates.push({
            id: detId,
            type: 'SIZE',
            title: lcomRisk.title,
            priority: pInfo.priority,
            priorityScore: pInfo.priorityScore,
            severity: lcomRisk.severity,
            confidence: pInfo.confidence,
            summary: lcomRisk.description,
            mainFile: fileAnalysis.filePath,
            files: affFiles,
            fileRanges: fRanges,
            evidence: lcomRisk.evidence,
            suggestedStrategies: strategies,
            decompositionBlueprint: blueprint,
            estimatedScope: {
              fileCount: 1,
              downstreamImpact: 0,
            },
          });
        }
      }
    }
  }

  candidates.sort((a, b) => b.priorityScore - a.priorityScore);

  return {
    summary: `Identified ${candidates.length} refactoring candidates.`,
    candidateCount: candidates.length,
    critical: candidates.filter(c => c.priority === 'critical').length,
    high: candidates.filter(c => c.priority === 'high').length,
    topPriorityScore: candidates.length > 0 ? candidates[0].priorityScore : 0,
    candidates,
  };
}
