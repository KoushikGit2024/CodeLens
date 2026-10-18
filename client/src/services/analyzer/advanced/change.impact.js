/**
 * change.impact.js
 *
 * It initiates the change impact workflow, extracts direct and transitive dependencies,
 * applies decaying distance propagation and graph centrality weighting, and categorizes
 * the blast radius risk into deterministic tiers.
 */

import { getFileDependencies } from '../dependencies/dependency.analyzer.js';
import { buildArchitectureModel } from './architecture.analyzer.js';
import { createAnalysisFinding } from '../parsing/symbols.js';

// Decay factor per graph hop (depth 1 = 1.0, depth 2 = 0.5, depth 3 = 0.25, ...)
const HOP_DECAY_RATE = 0.5;

/**
 * Calculates node weight based on graph centrality / in-degree.
 * A hub file that many other files depend on has higher blast weight.
 */
function getNodeCentralityWeight(graph, filePath) {
  if (!graph?.nodes) return 1.0;
  const targetId = `file:${filePath}`;
  const inDegree = (graph.edges || []).filter(e => e.target === targetId).length;
  // Logarithmic scaling: 0 in-degree = 1.0, 5 in-degree = ~2.58, 15 in-degree = ~4.0
  return 1.0 + Math.log2(1.0 + inDegree);
}

/**
 * Categorizes the blast radius into deterministic risk tiers.
 */
function determineRiskTier(totalAffectedCount, blastRadiusScore, maxDepth, criticalHubCount) {
  if (totalAffectedCount === 0) return 'none';
  if (blastRadiusScore >= 35 || totalAffectedCount >= 25 || criticalHubCount >= 3) {
    return 'critical';
  }
  if (blastRadiusScore >= 18 || totalAffectedCount >= 12 || criticalHubCount >= 1) {
    return 'high';
  }
  if (blastRadiusScore >= 6 || totalAffectedCount >= 4) {
    return 'moderate';
  }
  return 'low';
}

/**
 * It processes the changed files array, then extracts their direct graph dependents,
 * and then it applies a Breadth-First Search (BFS) to map the transitive ripple effect
 * with decaying distance weights, depth levels, and critical hub identification.
 */
export function analyzeChangeImpact(analysis, graph, changedFiles = []) {
  if (!changedFiles || changedFiles.length === 0) {
    return {
      changedFiles: [],
      directlyAffectedFiles: [],
      transitivelyAffectedFiles: [],
      affectedComponents: [],
      affectedByDepth: {},
      maxDepth: 0,
      blastRadiusScore: 0,
      riskTier: 'none',
      criticalHubFiles: [],
      summary: 'No files selected for impact analysis.',
      findings: [],
    };
  }

  const architecture = analysis && graph ? buildArchitectureModel(analysis, graph) : { layers: [] };
  const changedSet = new Set(changedFiles);

  // Depth tracking: filePath -> hop distance from nearest changed file
  const fileDepths = new Map();
  const directlyAffectedFiles = new Set();
  const transitivelyAffectedFiles = new Set();

  // Queue holds: { filePath, depth }
  const queue = [];
  const visited = new Set(changedFiles);

  // Step 1: Identify direct dependents (depth = 1)
  for (const changedFile of changedFiles) {
    const deps = getFileDependencies(graph, changedFile);
    for (const dependent of deps.dependents) {
      if (!changedSet.has(dependent.filePath)) {
        directlyAffectedFiles.add(dependent.filePath);
        if (!visited.has(dependent.filePath)) {
          visited.add(dependent.filePath);
          fileDepths.set(dependent.filePath, 1);
          queue.push({ filePath: dependent.filePath, depth: 1 });
        }
      }
    }
  }

  // Step 2: BFS for transitive ripple effect with distance tracking
  let head = 0;
  while (head < queue.length) {
    const { filePath: current, depth } = queue[head++];
    const deps = getFileDependencies(graph, current);

    for (const dependent of deps.dependents) {
      if (!visited.has(dependent.filePath)) {
        visited.add(dependent.filePath);
        const nextDepth = depth + 1;
        fileDepths.set(dependent.filePath, nextDepth);
        transitivelyAffectedFiles.add(dependent.filePath);
        queue.push({ filePath: dependent.filePath, depth: nextDepth });
      }
    }
  }

  // Step 3: Compute weighted blast radius and depth bucketing
  let totalWeightedScore = 0;
  const affectedByDepth = {};
  let maxDepth = 0;
  const criticalHubFiles = [];

  for (const [filePath, depth] of fileDepths.entries()) {
    maxDepth = Math.max(maxDepth, depth);
    if (!affectedByDepth[depth]) {
      affectedByDepth[depth] = [];
    }
    affectedByDepth[depth].push(filePath);

    // Decaying impact: depth 1 = 1.0, depth 2 = 0.5, depth 3 = 0.25...
    const decay = Math.pow(HOP_DECAY_RATE, depth - 1);
    const centralityWeight = getNodeCentralityWeight(graph, filePath);
    totalWeightedScore += decay * centralityWeight;

    // Detect critical hub junctions (files with >= 5 incoming dependencies)
    const targetId = `file:${filePath}`;
    const inDegree = (graph?.edges || []).filter(e => e.target === targetId).length;
    if (inDegree >= 5) {
      criticalHubFiles.push({
        filePath,
        inDegree,
        depth,
      });
    }
  }

  // Sort depth buckets
  for (const depth of Object.keys(affectedByDepth)) {
    affectedByDepth[depth].sort();
  }
  criticalHubFiles.sort((a, b) => b.inDegree - a.inDegree);

  const blastRadiusScore = Math.round(totalWeightedScore * 10) / 10;
  const totalAffectedCount = directlyAffectedFiles.size + transitivelyAffectedFiles.size;
  const riskTier = determineRiskTier(totalAffectedCount, blastRadiusScore, maxDepth, criticalHubFiles.length);

  // Step 4: Map architectural components / layers touched
  const affectedComponents = new Set();
  const allAffected = new Set([...changedFiles, ...directlyAffectedFiles, ...transitivelyAffectedFiles]);

  if (architecture?.layers && graph?.nodes) {
    for (const component of architecture.layers) {
      const componentFiles = graph.nodes
        .filter(n => n.type === 'fileNode' && n.data?.layer === component.data?.layer)
        .map(n => n.data?.filePath)
        .filter(Boolean);

      if (componentFiles.some(f => allAffected.has(f))) {
        affectedComponents.add(component.data?.label || component.data?.layer);
      }
    }
  }

  // Step 5: Construct Findings & Summary
  const findings = [];
  if (riskTier === 'high' || riskTier === 'critical') {
    const hubNote =
      criticalHubFiles.length > 0
        ? ` Crosses ${criticalHubFiles.length} critical hub file(s) including ${criticalHubFiles[0].filePath}.`
        : '';

    findings.push(
      createAnalysisFinding({
        id: `IMPACT-WIDE-BLAST-${changedFiles[0]}`,
        analyzerId: 'impact',
        ruleId: 'WIDE_BLAST_RADIUS',
        category: 'architecture',
        severity: riskTier === 'critical' ? 'error' : 'warning',
        title: `${riskTier === 'critical' ? 'Critical' : 'High'} Change Impact Detected`,
        message: `Modifying ${changedFiles.join(', ')} affects ${totalAffectedCount} downstream files across ${affectedComponents.size} component(s) (blast score: ${blastRadiusScore}, max depth: ${maxDepth}).${hubNote}`,
        filePath: changedFiles[0],
        range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 },
      })
    );
  }

  const directCount = directlyAffectedFiles.size;
  const transitiveCount = transitivelyAffectedFiles.size;
  const summary = `Modifying ${changedFiles.length} file(s) impacts ${directCount} direct and ${transitiveCount} transitive file(s) across ${affectedComponents.size} component(s) (Blast Radius: ${riskTier.toUpperCase()}, Score: ${blastRadiusScore}).`;

  return {
    changedFiles: Array.from(changedFiles).sort(),
    directlyAffectedFiles: Array.from(directlyAffectedFiles).sort(),
    transitivelyAffectedFiles: Array.from(transitivelyAffectedFiles).sort(),
    affectedComponents: Array.from(affectedComponents).sort(),
    affectedByDepth,
    maxDepth,
    blastRadiusScore,
    riskTier,
    criticalHubFiles,
    summary,
    findings,
  };
}
export { HOP_DECAY_RATE, determineRiskTier, getNodeCentralityWeight };
