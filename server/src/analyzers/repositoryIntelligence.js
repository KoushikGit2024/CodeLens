'use strict';

const { buildEngineeringRiskModel } = require('./engineeringRiskAnalyzer');
const { buildRefactoringIntelligence } = require('./refactoringAnalyzer');

/**
 * repositoryIntelligence.js
 * 
 * Aggregates existing deterministic models into a unified Repository Intelligence model.
 * Also calculates deterministic hotspots based on file size, coupling, architecture, and risks.
 */

// Bounded hotspot calculation to avoid penalizing legitimate healthy utilities
function calculateHotspots(analysis, graph, architectureModel, refactoringIntel) {
  const fileScores = new Map(); // filePath -> { score, reasons: [] }

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

  // 1. File Size
  analysis.files.forEach(f => {
    if (f.symbols && f.symbols.length > 30) {
      addScore(f.filePath, 10, 'Many symbols exported/defined');
    }
    // Optional: Size by line count could be added if we had raw line counts,
    // but AST node counts or symbol counts are a decent proxy.
  });

  // 2. Dependencies (Fan-in / Fan-out)
  graph.nodes.forEach(n => {
    if (n.type !== 'file') return;
    const filePath = n.filePath;
    
    let fanOut = 0;
    let fanIn = 0;
    
    graph.edges.forEach(e => {
      if (e.source === n.id) fanOut++;
      if (e.target === n.id) fanIn++;
    });

    if (fanOut > 10) addScore(filePath, 15, 'High fan-out (coordinates many dependencies)');
    if (fanOut > 20) addScore(filePath, 20, 'Extremely high fan-out (potential God module)');
    
    if (fanIn > 15) {
       // High fan-in might be a utility. We add some points because it's *important*,
       // but it's only a *problematic* hotspot if combined with high fan-out or size.
       addScore(filePath, 10, 'High fan-in (widely used)');
    }
  });

  // 3. Architecture Entry Points
  architectureModel.entryPoints.forEach(ep => {
    addScore(ep, 20, 'Architectural entry point');
  });

  // 4. Refactoring / Risks
  refactoringIntel.candidates.forEach(c => {
    // Determine priority weight
    const weight = c.priority === 'critical' ? 40 : (c.priority === 'high' ? 25 : 10);
    
    c.files.forEach(filePath => {
      addScore(filePath, weight, `Involved in ${c.priority} priority refactoring candidate`);
    });
  });

  // Construct final array
  const hotspots = [];
  fileScores.forEach((data, filePath) => {
    // Only include files with meaningful scores (e.g., >= 20)
    if (data.score >= 20) {
      // Cap the score roughly at 100
      const normalizedScore = Math.min(100, data.score);
      hotspots.push({
        filePath,
        score: normalizedScore,
        reasons: data.reasons
      });
    }
  });

  // Sort descending
  hotspots.sort((a, b) => b.score - a.score);

  return hotspots.slice(0, 15); // Top 15 hotspots
}

function buildRepositoryIntelligence(analysis, graph, architectureModel) {
  // Aggregate existing models
  const engineeringHealth = buildEngineeringRiskModel(analysis, graph, architectureModel);
  const refactoringIntel = buildRefactoringIntelligence(engineeringHealth);
  const hotspots = calculateHotspots(analysis, graph, architectureModel, refactoringIntel);

  return {
    repository: {
      name: analysis.name || 'Repository',
      fileCount: analysis.files.length,
      languages: analysis.languageSummary || {},
      analysisVersion: analysis.meta?.analysisVersion
    },
    architecture: {
      components: architectureModel.components.length,
      layers: [...new Set(architectureModel.components.map(c => c.layer))],
      entryPoints: architectureModel.entryPoints
    },
    dependencies: {
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      cycles: graph.cycles ? graph.cycles.length : 0,
      unresolved: graph.meta.unresolvedImports
    },
    engineeringHealth: {
      score: engineeringHealth.score,
      critical: engineeringHealth.metrics.critical,
      high: engineeringHealth.metrics.high,
      warnings: engineeringHealth.metrics.warning
    },
    refactoring: {
      candidateCount: refactoringIntel.candidateCount,
      critical: refactoringIntel.critical,
      high: refactoringIntel.high,
      topPriorityScore: refactoringIntel.topPriorityScore,
      topCandidates: refactoringIntel.candidates.slice(0, 3).map(c => ({
        id: c.id,
        title: c.title,
        priority: c.priority,
        score: c.priorityScore
      }))
    },
    hotspots: hotspots
  };
}

module.exports = {
  buildRepositoryIntelligence,
  calculateHotspots
};
