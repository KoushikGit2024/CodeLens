/**
 * risk.analyzer.js
 * 
 * It evaluates repository structures, then extracts dependency patterns, 
 * and then it applies threshold heuristic rules to surface engineering risks.
 */

import { v4 as uuidv4 } from 'uuid';
import { getFileDependencies, detectCycles, getIsolatedFiles } from '../dependencies/dependency.analyzer.js';
import { detectClones } from './clone.analyzer.js';
import { analyzeReachability } from './reachability.analyzer.js';

export const RISK_CATEGORIES = {
  SIZE: 'SIZE',
  COUPLING: 'COUPLING',
  DEPENDENCY: 'DEPENDENCY',
  ARCHITECTURE: 'ARCHITECTURE',
  QUALITY: 'QUALITY',
  CHURN: 'CHURN'
};

export const SEVERITY = {
  CRITICAL: 'critical',
  HIGH: 'high',
  WARNING: 'warning'
};

const THRESHOLDS = {
  FILE_LINES_HIGH: 500,
  FILE_LINES_WARNING: 300,
  EXPORTS_WARNING: 15,
  FAN_IN_WARNING: 10,
  FAN_OUT_WARNING: 15,
  COMPLEXITY_HIGH: 15,
  COMPLEXITY_WARNING: 10,
  CHURN_HIGH: 60,
  CHURN_WARNING: 30,
  COMPOSITE_RISK_HIGH: 70,
  COMPOSITE_RISK_CRITICAL: 85
};

const SEVERITY_PENALTY = {
  [SEVERITY.CRITICAL]: 10,
  [SEVERITY.HIGH]: 5,
  [SEVERITY.WARNING]: 2
};

/**
 * It receives risk parameters, then extracts structured metadata, 
 * and then it applies a UUID to generate a consistent risk object.
 */
function createRisk(category, severity, title, description, file, evidence = {}) {
  // Using native browser crypto if available, falling back to uuidv4 for safety
  const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : uuidv4();
  return { id, category, severity, title, description, file, evidence };
}

/**
 * It iterates over the AST files, then extracts line counts and exports, 
 * and then it applies numerical thresholds to identify bloated files.
 */
function analyzeSizeRisks(analysis) {
  const risks = [];
  
  if (!analysis?.files) return risks;

  for (const file of analysis.files) {
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

    const exportCount = (file.symbols || []).filter(s => s.kind === 'export').length;
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

/**
 * It maps file paths against the dependency graph, then extracts their node degrees, 
 * and then it applies limits to flag high coupling bottlenecks.
 */
function analyzeCouplingRisks(analysis, graph) {
  const risks = [];
  if (!analysis?.files || !graph?.edges) return risks;

  for (const file of analysis.files) {
    const deps = getFileDependencies(graph, file.filePath);
    
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

/**
 * It analyzes the graph edges, then extracts backward cyclic references, 
 * and then it applies severe risk tags to cyclical and isolated files.
 */
function analyzeDependencyRisks(graph) {
  const risks = [];
  if (!graph) return risks;

  const cycles = detectCycles(graph);
  for (const cycle of cycles) {
    risks.push(createRisk(
      RISK_CATEGORIES.DEPENDENCY,
      SEVERITY.CRITICAL,
      'Circular Dependency Detected',
      `Cycle path: ${cycle.join(' → ')}`,
      cycle[0], 
      { cyclePath: cycle }
    ));
  }

  if (graph.meta && graph.meta.unresolvedImports > 0) {
    risks.push(createRisk(
      RISK_CATEGORIES.DEPENDENCY,
      SEVERITY.HIGH,
      'Unresolved Dependencies',
      `Repository contains ${graph.meta.unresolvedImports} unresolved import(s). This may indicate broken internal paths or missing external packages.`,
      null,
      { count: graph.meta.unresolvedImports }
    ));
  }

  const isolatedFiles = getIsolatedFiles(graph);
  for (const isolated of isolatedFiles) {
    risks.push(createRisk(
      RISK_CATEGORIES.DEPENDENCY,
      SEVERITY.WARNING,
      'Isolated Module',
      'File is neither imported by nor imports any other internal file.',
      isolated,
      {}
    ));
  }

  return risks;
}

/**
 * It parses the pre-calculated architecture model, then extracts layer violations, 
 * and then it applies them directly into the risk registry.
 */
function analyzeArchitectureRisks(architecture) {
  const risks = [];
  if (!architecture?.boundaryViolations) return risks;

  for (const violation of architecture.boundaryViolations) {
    risks.push(createRisk(
      RISK_CATEGORIES.ARCHITECTURE,
      violation.severity || SEVERITY.HIGH,
      'Cross-Layer Violation',
      violation.message || violation.description,
      violation.filePath,
      { sourceComp: violation.filePath, ruleId: violation.ruleId }
    ));
  }

  return risks;
}

/**
 * It aggregates function ASTs, then extracts structural clones and dead code, 
 * and then it applies the findings as quality maintenance warnings.
 */
function analyzeCodeQualityRisks(analysis, graph) {
  const risks = [];
  const allFunctions = [];
  
  if (analysis?.files) {
    for (const file of analysis.files) {
      if (file.hasErrors || file.error) continue;
      
      for (const sym of (file.symbols || [])) {
        if (['function', 'method', 'arrow'].includes(sym.kind)) {
          allFunctions.push({ ...sym, filePath: file.filePath });
          
          if (sym.complexity > THRESHOLDS.COMPLEXITY_HIGH) {
            risks.push(createRisk(
              RISK_CATEGORIES.QUALITY,
              SEVERITY.HIGH,
              'High Cyclomatic Complexity',
              `${sym.kind} '${sym.name}' has a high complexity score of ${sym.complexity}. Consider refactoring.`,
              file.filePath,
              { name: sym.name, complexity: sym.complexity, location: sym.location }
            ));
          } else if (sym.complexity > THRESHOLDS.COMPLEXITY_WARNING) {
            risks.push(createRisk(
              RISK_CATEGORIES.QUALITY,
              SEVERITY.WARNING,
              'Elevated Complexity',
              `${sym.kind} '${sym.name}' has a complexity score of ${sym.complexity}.`,
              file.filePath,
              { name: sym.name, complexity: sym.complexity, location: sym.location }
            ));
          }
        }
      }
    }
  }

  const { cloneGroups } = detectClones(allFunctions, "repository");
  if (cloneGroups) {
    for (const clone of cloneGroups) {
      const filePaths = clone.instances.map(i => i.filePath);
      risks.push(createRisk(
        RISK_CATEGORIES.QUALITY,
        SEVERITY.WARNING,
        'Structural Code Clone',
        `Found ${clone.count} instances of structurally identical code.`,
        filePaths[0],
        { count: clone.count, instances: clone.instances }
      ));
    }
  }

  const reachability = analyzeReachability(graph);
  if (reachability?.unreachableFiles) {
    for (const deadFile of reachability.unreachableFiles) {
      if (deadFile.startsWith('pkg:') || deadFile.startsWith('moduleNode')) continue;
      
      const rawPath = deadFile.replace(/^file:/, '');
      risks.push(createRisk(
        RISK_CATEGORIES.QUALITY,
        SEVERITY.WARNING,
        'Dead / Unreachable File',
        'This file is never imported by any other file in the repository.',
        rawPath,
        {}
      ));
    }
  }

  return risks;
}

/**
 * It reduces the risk payload, then extracts the severity penalties, 
 * and then it applies a final calculation for an overall health score.
 */
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

/**
 * It aggregates the file-level penalties, then extracts the top offenders, 
 * and then it applies a descending sort to return the primary hotspots.
 */
function determineHotspots(risks) {
  const fileScores = new Map();

  for (const risk of risks) {
    if (!risk.file) continue;
    const penalty = SEVERITY_PENALTY[risk.severity] || 0;
    fileScores.set(risk.file, (fileScores.get(risk.file) || 0) + penalty);
  }

  return Array.from(fileScores.entries())
    .sort((a, b) => b[1] - a[1]) 
    .slice(0, 5) 
    .map(entry => entry[0]);
}

/**
 * It reads the gitChurn data from the analysis object, then extracts files
 * exceeding churn thresholds, and then it applies composite risk scoring
 * to surface the highest-priority files for review.
 */
function analyzeChurnRisks(analysis) {
  const risks = [];
  const gitChurn = analysis?.gitChurn;
  if (!gitChurn || !gitChurn.churnScores) return risks;

  for (const [filePath, churnScore] of Object.entries(gitChurn.churnScores)) {
    // Skip .git files
    if (filePath.startsWith('.git/')) continue;

    // Find matching file node to get composite risk
    const fileNode = analysis.files?.find(f => f.filePath === filePath);
    const compositeRisk = fileNode?.metrics?.compositeRisk || churnScore;

    if (compositeRisk >= THRESHOLDS.COMPOSITE_RISK_CRITICAL) {
      risks.push(createRisk(
        RISK_CATEGORIES.CHURN,
        SEVERITY.CRITICAL,
        'Critical Composite Risk (High Churn + High Complexity)',
        `This file has a composite risk score of ${compositeRisk}/100, driven by frequent changes (churn: ${churnScore}/100) combined with high cyclomatic complexity. It is the most likely source of regressions.`,
        filePath,
        { churnScore, compositeRisk, commitsModified: gitChurn.fileChurn?.[filePath] || 0 }
      ));
    } else if (compositeRisk >= THRESHOLDS.COMPOSITE_RISK_HIGH) {
      risks.push(createRisk(
        RISK_CATEGORIES.CHURN,
        SEVERITY.HIGH,
        'High Composite Risk (Churn + Complexity)',
        `This file has a composite risk score of ${compositeRisk}/100 (churn: ${churnScore}/100). Frequently modified complex files are hotspots for bugs.`,
        filePath,
        { churnScore, compositeRisk, commitsModified: gitChurn.fileChurn?.[filePath] || 0 }
      ));
    } else if (churnScore >= THRESHOLDS.CHURN_HIGH) {
      risks.push(createRisk(
        RISK_CATEGORIES.CHURN,
        SEVERITY.WARNING,
        'High Churn File',
        `This file is modified very frequently (churn score: ${churnScore}/100). Frequent changes may indicate unstable design or ongoing development.`,
        filePath,
        { churnScore, commitsModified: gitChurn.fileChurn?.[filePath] || 0 }
      ));
    }
  }

  return risks;
}

/**
 * It orchestrates the sub-analyzers, then extracts all potential failures, 
 * and then it applies aggregation to build the comprehensive risk profile.
 */
export function buildEngineeringRiskModel(analysis, graph, architecture) {
  const risks = [
    ...analyzeSizeRisks(analysis),
    ...analyzeCouplingRisks(analysis, graph),
    ...analyzeDependencyRisks(graph),
    ...analyzeArchitectureRisks(architecture),
    ...analyzeCodeQualityRisks(analysis, graph),
    ...analyzeChurnRisks(analysis)
  ];

  const { score, riskLevel } = calculateScoreAndLevel(risks);
  const hotspots = determineHotspots(risks);

  const metrics = {
    totalRisks: risks.length,
    critical: risks.filter(r => r.severity === SEVERITY.CRITICAL).length,
    high:     risks.filter(r => r.severity === SEVERITY.HIGH).length,
    warning:  risks.filter(r => r.severity === SEVERITY.WARNING).length,
  };

  // Build a sorted top-churn table for the UI (high churn + high composite)
  const churnTable = analysis?.gitChurn?.churnScores
    ? Object.entries(analysis.gitChurn.churnScores)
        .filter(([fp]) => !fp.startsWith('.git/'))
        .map(([filePath, churnScore]) => {
          const fileNode = analysis.files?.find(f => f.filePath === filePath);
          return {
            filePath,
            churnScore,
            compositeRisk: fileNode?.metrics?.compositeRisk || churnScore,
            commitsModified: analysis.gitChurn.fileChurn?.[filePath] || 0,
          };
        })
        .sort((a, b) => b.compositeRisk - a.compositeRisk)
        .slice(0, 20)
    : [];

  return {
    summary: `Identified ${risks.length} engineering risk(s) across the repository.`,
    score,
    riskLevel,
    metrics,
    hotspots,
    risks,
    churnTable,
    gitChurnAvailable: !!analysis?.gitChurn,
    recommendations: [] 
  };
}