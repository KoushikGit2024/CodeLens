/**
 * intelligence.analyzer.js
 *
 * It ingests the core AST analysis payloads, then extracts architectural hotspots,
 * and then it applies an aggregation function to compile a unified health index.
 */

import { buildEngineeringRiskModel } from './risk.analyzer.js';
import { buildRefactoringIntelligence } from './refactoring.analyzer.js';

/**
 * It iterates over files and edges, then extracts proxy metrics for coupling and size,
 * and then it applies a bounding logic to identify critical structural hotspots.
 */
export function calculateHotspots(analysis, graph, architectureModel, refactoringIntel) {
  const fileScores = new Map();

  function getOrInit(filePath) {
    if (!fileScores.has(filePath)) {
      fileScores.set(filePath, { score: 0, reasons: [] });
    }
    return fileScores.get(filePath);
  }

  function addScore(filePath, points, reason) {
    const data = getOrInit(filePath);
    data.score += points;
    data.reasons.push(reason);
  }

  if (analysis?.files) {
    analysis.files.forEach(f => {
      if (f.symbols && f.symbols.length > 30) {
        addScore(f.filePath, 10, 'Many symbols exported/defined');
      }
    });
  }

  if (graph?.nodes && graph?.edges) {
    graph.nodes.forEach(n => {
      if (n.type !== 'fileNode') return;
      const filePath = n.data.filePath;

      let fanOut = 0;
      let fanIn = 0;

      graph.edges.forEach(e => {
        if (e.source === n.id) fanOut++;
        if (e.target === n.id) fanIn++;
      });

      if (fanOut > 10) addScore(filePath, 15, 'High fan-out (coordinates many dependencies)');
      if (fanOut > 20) addScore(filePath, 20, 'Extremely high fan-out (potential God module)');
      if (fanIn > 15) {
        addScore(filePath, 10, 'High fan-in (widely used)');
      }
    });
  }

  if (architectureModel?.entryPoints) {
    architectureModel.entryPoints.forEach(ep => {
      addScore(ep, 20, 'Architectural entry point');
    });
  }

  if (refactoringIntel?.candidates) {
    refactoringIntel.candidates.forEach(c => {
      const weight = c.priority === 'critical' ? 40 : c.priority === 'high' ? 25 : 10;
      c.files.forEach(filePath => {
        addScore(filePath, weight, `Involved in ${c.priority} priority refactoring candidate`);
      });
    });
  }

  const hotspots = [];
  fileScores.forEach((data, filePath) => {
    if (data.score >= 20) {
      const normalizedScore = Math.min(100, data.score);
      hotspots.push({
        filePath,
        score: normalizedScore,
        reasons: data.reasons,
      });
    }
  });

  hotspots.sort((a, b) => b.score - a.score);

  return hotspots.slice(0, 15);
}

/**
 * It resolves the various advanced models, then extracts their topmost metrics,
 * and then it applies them into a single comprehensive repository intelligence payload.
 */
export function buildRepositoryIntelligence(analysis, graph, architectureModel) {
  let engineeringHealth = { score: 100, metrics: { critical: 0, high: 0, warning: 0 } };
  let refactoringIntel = { candidateCount: 0, critical: 0, high: 0, topPriorityScore: 0, candidates: [] };

  try {
    engineeringHealth = buildEngineeringRiskModel(analysis, graph, architectureModel);
    refactoringIntel = buildRefactoringIntelligence(engineeringHealth);
  } catch (err) {
    console.warn('[intelligence.analyzer] Using degraded health metrics due to missing sub-analyzers.');
  }

  const hotspots = calculateHotspots(analysis, graph, architectureModel, refactoringIntel);

  return {
    repository: {
      name: analysis.name || 'Repository',
      fileCount: analysis.files?.length || 0,
      languages: analysis.languageSummary || {},
      analysisVersion: analysis.meta?.analysisVersion,
    },
    architecture: {
      components: architectureModel?.layers?.length || 0,
      layers: [...new Set((architectureModel?.layers || []).map(c => c.data.layer))],
      entryPoints: architectureModel?.entryPoints || [],
    },
    dependencies: {
      nodes: graph?.nodes?.length || 0,
      edges: graph?.edges?.length || 0,
      cycles: graph?.cycles ? graph.cycles.length : 0,
      unresolved: graph?.meta?.unresolvedImports || 0,
    },
    engineeringHealth: {
      score: engineeringHealth.score,
      critical: engineeringHealth.metrics.critical,
      high: engineeringHealth.metrics.high,
      warnings: engineeringHealth.metrics.warning,
    },
    refactoring: {
      candidateCount: refactoringIntel.candidateCount,
      critical: refactoringIntel.critical,
      high: refactoringIntel.high,
      topPriorityScore: refactoringIntel.topPriorityScore,
      topCandidates: (refactoringIntel.candidates || []).slice(0, 3).map(c => ({
        id: c.id,
        title: c.title,
        priority: c.priority,
        score: c.priorityScore,
      })),
    },
    hotspots: hotspots,
  };
}
