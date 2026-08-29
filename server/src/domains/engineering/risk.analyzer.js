'use strict';

const { v4: uuidv4 } = require('uuid');
const { getFileDependencies } = require('../dependencies/dependency.analyzer');

/**
 * engineeringRiskAnalyzer.js
 * 
 * Analyzes repository structure, dependencies, and architecture to identify
 * potential engineering risks (coupling, size, cycles, layer violations).
 */

const RISK_CATEGORIES = {
  SIZE: 'SIZE',
  COUPLING: 'COUPLING',
  DEPENDENCY: 'DEPENDENCY',
  ARCHITECTURE: 'ARCHITECTURE'
};

const SEVERITY = {
  CRITICAL: 'critical',
  HIGH: 'high',
  WARNING: 'warning'
};

const THRESHOLDS = {
  FILE_LINES_HIGH: 500,
  FILE_LINES_WARNING: 300,
  EXPORTS_WARNING: 15,
  FAN_IN_WARNING: 10,
  FAN_OUT_WARNING: 15
};

const SEVERITY_PENALTY = {
  [SEVERITY.CRITICAL]: 10,
  [SEVERITY.HIGH]: 5,
  [SEVERITY.WARNING]: 2
};

function createRisk(category, severity, title, description, file, evidence = {}) {
  return {
    id: uuidv4(),
    category,
    severity,
    title,
    description,
    file,
    evidence
  };
}

function analyzeSizeRisks(analysis) {
  const risks = [];
  
  for (const file of analysis.files) {
    // 1. Line count
    if (file.lineCount > THRESHOLDS.FILE_LINES_HIGH) {
      risks.push(createRisk(
        RISK_CATEGORIES.SIZE,
        SEVERITY.HIGH,
        'Very large file',
        `File is unusually large (${file.lineCount} lines), suggesting multiple responsibilities.`,
        file.filePath,
        { lineCount: file.lineCount, threshold: THRESHOLDS.FILE_LINES_HIGH }
      ));
    } else if (file.lineCount > THRESHOLDS.FILE_LINES_WARNING) {
      risks.push(createRisk(
        RISK_CATEGORIES.SIZE,
        SEVERITY.WARNING,
        'Large file',
        `File is large (${file.lineCount} lines).`,
        file.filePath,
        { lineCount: file.lineCount, threshold: THRESHOLDS.FILE_LINES_WARNING }
      ));
    }

    // 2. Export surface
    const exportCount = file.symbols.filter(s => s.kind === 'export').length;
    if (exportCount > THRESHOLDS.EXPORTS_WARNING) {
      risks.push(createRisk(
        RISK_CATEGORIES.SIZE,
        SEVERITY.WARNING,
        'Large public API surface',
        `File exports ${exportCount} symbols, suggesting an overly broad public interface.`,
        file.filePath,
        { exportCount, threshold: THRESHOLDS.EXPORTS_WARNING }
      ));
    }
  }

  return risks;
}

function analyzeCouplingRisks(analysis, graph) {
  const risks = [];

  for (const file of analysis.files) {
    const deps = getFileDependencies(graph, file.filePath);
    
    // 1. Fan-in
    if (deps.dependentCount > THRESHOLDS.FAN_IN_WARNING) {
      risks.push(createRisk(
        RISK_CATEGORIES.COUPLING,
        SEVERITY.WARNING,
        'High fan-in (Central Module)',
        `Many modules (${deps.dependentCount}) depend on this file. Changes here carry high impact.`,
        file.filePath,
        { fanIn: deps.dependentCount, threshold: THRESHOLDS.FAN_IN_WARNING }
      ));
    }

    // 2. Fan-out
    if (deps.dependencyCount > THRESHOLDS.FAN_OUT_WARNING) {
      risks.push(createRisk(
        RISK_CATEGORIES.COUPLING,
        SEVERITY.WARNING,
        'High fan-out (Dependency Bottleneck)',
        `File depends on many other modules (${deps.dependencyCount}), suggesting high coupling.`,
        file.filePath,
        { fanOut: deps.dependencyCount, threshold: THRESHOLDS.FAN_OUT_WARNING }
      ));
    }
  }

  return risks;
}

function analyzeDependencyRisks(architecture) {
  const risks = [];

  // 1. Cycles
  if (architecture.cycles) {
    for (const cycle of architecture.cycles) {
      risks.push(createRisk(
        RISK_CATEGORIES.DEPENDENCY,
        SEVERITY.CRITICAL,
        'Circular Dependency Detected',
        `Cycle path: ${cycle.join(' → ')}`,
        cycle[0], // Attribute to the first file in cycle
        { cyclePath: cycle }
      ));
    }
  }

  // 2. Unresolved imports
  if (architecture.unresolvedDependencies > 0) {
    risks.push(createRisk(
      RISK_CATEGORIES.DEPENDENCY,
      SEVERITY.HIGH,
      'Unresolved Dependencies',
      `Repository contains ${architecture.unresolvedDependencies} unresolved import(s). This may indicate broken internal paths or missing external packages.`,
      null,
      { count: architecture.unresolvedDependencies }
    ));
  }

  // 3. Isolated files
  if (architecture.isolatedFiles) {
    for (const isolated of architecture.isolatedFiles) {
      risks.push(createRisk(
        RISK_CATEGORIES.DEPENDENCY,
        SEVERITY.WARNING,
        'Isolated Module',
        'File is neither imported by nor imports any other internal file.',
        isolated,
        {}
      ));
    }
  }

  return risks;
}

function analyzeArchitectureRisks(architecture) {
  const risks = [];
  
  if (!architecture.components || !architecture.relations) return risks;

  const componentLayerMap = new Map();
  for (const comp of architecture.components) {
    componentLayerMap.set(comp.name, comp.layer);
  }

  for (const rel of architecture.relations) {
    if (rel.targetType !== 'internal') continue;

    const sourceLayer = componentLayerMap.get(rel.source);
    const targetLayer = componentLayerMap.get(rel.target);

    // Rule: Presentation layer should not depend directly on Data layer
    if (sourceLayer === 'Presentation' && targetLayer === 'Data') {
      risks.push(createRisk(
        RISK_CATEGORIES.ARCHITECTURE,
        SEVERITY.HIGH,
        'Cross-Layer Violation',
        `Presentation component "${rel.source}" depends directly on Data component "${rel.target}".`,
        rel.evidenceFile,
        { sourceComp: rel.source, targetComp: rel.target, sourceLayer, targetLayer }
      ));
    }
  }

  return risks;
}

function calculateScoreAndLevel(risks) {
  let score = 100;
  
  for (const risk of risks) {
    score -= (SEVERITY_PENALTY[risk.severity] || 0);
  }
  
  score = Math.max(0, score);
  
  let riskLevel = 'LOW';
  if (score < 50) riskLevel = 'CRITICAL';
  else if (score < 70) riskLevel = 'HIGH';
  else if (score < 90) riskLevel = 'MEDIUM';

  return { score, riskLevel };
}

function determineHotspots(risks) {
  const fileScores = new Map();

  for (const risk of risks) {
    if (!risk.file) continue;
    const penalty = SEVERITY_PENALTY[risk.severity] || 0;
    fileScores.set(risk.file, (fileScores.get(risk.file) || 0) + penalty);
  }

  const sortedFiles = Array.from(fileScores.entries())
    .sort((a, b) => b[1] - a[1]) // Sort descending by penalty
    .slice(0, 5) // Top 5
    .map(entry => entry[0]);

  return sortedFiles;
}

/**
 * Build the engineering risk model.
 *
 * @param {object} analysis - RepositoryAnalysis
 * @param {object} graph - DependencyGraph
 * @param {object} architecture - ArchitectureModel
 * @returns {object} EngineeringRiskModel
 */
function buildEngineeringRiskModel(analysis, graph, architecture) {
  const risks = [
    ...analyzeSizeRisks(analysis),
    ...analyzeCouplingRisks(analysis, graph),
    ...analyzeDependencyRisks(architecture),
    ...analyzeArchitectureRisks(architecture)
  ];

  const { score, riskLevel } = calculateScoreAndLevel(risks);
  const hotspots = determineHotspots(risks);

  const metrics = {
    totalRisks: risks.length,
    critical: risks.filter(r => r.severity === SEVERITY.CRITICAL).length,
    high:     risks.filter(r => r.severity === SEVERITY.HIGH).length,
    warning:  risks.filter(r => r.severity === SEVERITY.WARNING).length,
  };

  return {
    summary: `Identified ${risks.length} engineering risk(s) across the repository.`,
    score,
    riskLevel,
    metrics,
    hotspots,
    risks,
    recommendations: [] // Stub for AI/deterministic recommendations
  };
}

module.exports = {
  buildEngineeringRiskModel,
  RISK_CATEGORIES,
  SEVERITY
};
