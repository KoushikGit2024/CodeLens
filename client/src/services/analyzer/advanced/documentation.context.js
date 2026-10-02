/**
 * documentation.context.js
 *
 * It aggregates AST analysis outputs, then extracts precise architectural boundaries,
 * and then it applies JSON formatting instructions to generate targeted LLM prompts.
 */

import { getIsolatedFiles, detectCycles } from '../dependencies/dependency.analyzer.js';
import { buildEngineeringRiskModel } from './risk.analyzer.js';
import { buildRefactoringIntelligence } from './refactoring.analyzer.js';
import { buildRepositoryIntelligence } from './intelligence.analyzer.js';

/**
 * It compiles the repository facts, then extracts unified architectural statistics,
 * and then it applies them into a structured object for the overview prompt.
 */
export function buildOverviewContext(analysis, graph, architectureModel) {
  let riskModel = { metrics: { critical: 0, high: 0, warning: 0 } };
  let refactoringIntel = { candidateCount: 0, critical: 0, candidates: [] };
  let unifiedIntel = { repository: { languages: {} }, engineeringHealth: { score: 100 }, hotspots: [] };

  try {
    riskModel = buildEngineeringRiskModel(analysis, graph, architectureModel);
    refactoringIntel = buildRefactoringIntelligence(riskModel);
    unifiedIntel = buildRepositoryIntelligence(analysis, graph, architectureModel);
  } catch (e) {
    console.warn('[documentation.context] Degraded facts due to missing sub-analyzers.');
  }

  return {
    projectName: analysis.name || 'Repository',
    meta: {
      totalFiles: analysis.files?.length || 0,
      totalEdges: graph.edges?.length || 0,
      unresolvedImports: graph.meta?.unresolvedImports || 0,
      languages: Object.keys(unifiedIntel.repository.languages || {}),
      healthScore: unifiedIntel.engineeringHealth.score,
    },
    engineeringRisks: {
      cycles: detectCycles(graph).length,
      isolatedFiles: getIsolatedFiles(graph).length,
    },
    refactoringCandidates: {
      total: refactoringIntel.candidateCount,
      critical: refactoringIntel.critical,
      topCandidates: refactoringIntel.candidates.slice(0, 3).map(c => ({
        title: c.title,
        priority: c.priority,
        files: c.files,
      })),
    },
    entryPoints: architectureModel.entryPoints || [],
    apiBoundaries: (architectureModel.apiBoundaries || []).map(b => ({
      filePath: b.filePath,
      exports: b.exports,
    })),
    components: (architectureModel.layers || []).map(c => ({
      name: c.data.label,
      layer: c.data.layer,
      fileCount: graph.nodes.filter(n => n.type === 'fileNode' && n.data.layer === c.data.layer).length,
    })),
    hotspots: unifiedIntel.hotspots.slice(0, 5).map(h => ({
      filePath: h.filePath,
      reasons: h.reasons,
    })),
    keyExternalPackages: getTopExternalPackages(graph, 10),
  };
}

/**
 * It isolates a single file node, then extracts its incoming and outgoing edges,
 * and then it applies layer logic to define its module-level boundary context.
 */
export function buildModuleContext(analysis, graph, architectureModel, filePath) {
  const file = analysis.files.find(f => f.filePath === filePath);
  if (!file) throw new Error(`File not found in analysis: ${filePath}`);

  let componentName = 'Unknown';
  let layer = 'Unknown';

  const fileNode = graph.nodes.find(n => n.id === `file:${filePath}`);
  if (fileNode && fileNode.data.layer) {
    layer = fileNode.data.layer;
    const compNode = architectureModel.layers?.find(c => c.data.layer === layer);
    if (compNode) componentName = compNode.data.label;
  }

  const deps = graph.edges
    .filter(e => e.source === `file:${filePath}`)
    .map(e => {
      const targetNode = graph.nodes.find(n => n.id === e.target);
      return targetNode ? targetNode.data?.filePath || targetNode.data?.label : e.target;
    });

  const dependents = graph.edges
    .filter(e => e.target === `file:${filePath}`)
    .map(e => {
      const srcNode = graph.nodes.find(n => n.id === e.source);
      return srcNode ? srcNode.data?.filePath || srcNode.data?.label : e.source;
    });

  const exports = file.symbols
    .filter(s => s.kind === 'export')
    .map(s => s.name)
    .filter(Boolean);

  const isApiBoundary = (architectureModel.apiBoundaries || []).some(b => b.filePath === filePath);

  return {
    filePath,
    language: file.language || 'unknown',
    component: componentName,
    layer,
    isApiBoundary,
    exports,
    dependencies: deps,
    dependents,
    symbolCount: file.symbols.length,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * It filters the graph for module nodes, then extracts their incoming degree counts,
 * and then it applies sorting to surface the most relied-upon external dependencies.
 */
function getTopExternalPackages(graph, limit = 10) {
  const packageNodes = graph.nodes.filter(n => n.type === 'moduleNode');

  const incoming = {};
  for (const edge of graph.edges) {
    if (incoming[edge.target] === undefined) {
      incoming[edge.target] = 0;
    }
    incoming[edge.target]++;
  }

  const scored = packageNodes.map(pkg => ({
    name: pkg.data.label,
    usageCount: incoming[pkg.id] || 0,
  }));

  scored.sort((a, b) => b.usageCount - a.usageCount);
  return scored.slice(0, limit).map(p => p.name);
}

// ── Prompt Generators ─────────────────────────────────────────────────────────

export function buildOverviewPrompt(context) {
  return `You are an expert technical writer and software architect.
I will provide you with deterministic structural facts about a codebase.
Your job is to write a high-level "Repository Overview" JSON object.

Repository Facts:
${JSON.stringify(context, null, 2)}

Instructions:
Generate a structured JSON output with the following exact keys:
{
  "summary": "A 2-3 sentence high-level summary of what this repository appears to do.",
  "technologies": ["List of inferred main technologies/frameworks"],
  "architectureSummary": "A brief explanation of how the components and layers interact.",
  "observations": ["List of interesting architectural facts or tight couplings inferred"],
  "technicalDebtSummary": "A brief summary of the most critical refactoring candidates and cycles provided in the facts.",
  "hotspotsSummary": "A brief sentence identifying the most important/central files based on the hotspots array."
}

Do NOT output any markdown blocks (e.g. \`\`\`json). Output raw valid JSON only. Do NOT hallucinate packages or components that are not in the facts.`;
}

export function buildModulePrompt(context) {
  return `You are an expert technical writer and software engineer.
I will provide you with deterministic structural facts about a specific module/file in a codebase.
Your job is to write a "Module Documentation" JSON object for it.

Module Facts:
${JSON.stringify(context, null, 2)}

Instructions:
Generate a structured JSON output with the following exact keys:
{
  "responsibility": "A 2-3 sentence summary of what this module's primary responsibility is.",
  "architectureRole": "How this module fits into its containing component/layer.",
  "apiNotes": "If this is an API boundary, explain what it likely exposes. If not, put null.",
  "inferredDependenciesPurpose": "A brief sentence explaining why it likely imports its main dependencies."
}

Do NOT output any markdown blocks (e.g. \`\`\`json). Output raw valid JSON only. Do NOT hallucinate dependencies or exports that are not in the facts.`;
}
