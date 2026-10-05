/**
 * risk.analyzer.js
 *
 * It evaluates repository structures, then extracts dependency patterns,
 * and then it applies threshold heuristic rules to surface engineering risks.
 */

import { getFileDependencies, detectCycles, getIsolatedFiles } from '../dependencies/dependency.analyzer.js';
import { detectClones } from './clone.analyzer.js';
import { analyzeReachability } from './reachability.analyzer.js';

export const RISK_CATEGORIES = {
  SIZE: 'SIZE',
  COUPLING: 'COUPLING',
  DEPENDENCY: 'DEPENDENCY',
  ARCHITECTURE: 'ARCHITECTURE',
  QUALITY: 'QUALITY',
  CHURN: 'CHURN',
};

export const SEVERITY = {
  CRITICAL: 'critical',
  HIGH: 'high',
  WARNING: 'warning',
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
  COMPOSITE_RISK_CRITICAL: 85,
};

const SEVERITY_PENALTY = {
  [SEVERITY.CRITICAL]: 10,
  [SEVERITY.HIGH]: 5,
  [SEVERITY.WARNING]: 2,
};

/**
 * It hashes a string using djb2, then applies bit mixing,
 * and then it returns a compact hex string for use as a stable ID.
 * The hash is based on semantic identity (file + category + name), NOT line numbers,
 * so the ID survives minor code edits that shift line numbers.
 */
function stableHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h = h >>> 0; // Keep unsigned 32-bit
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * It receives semantic identifiers, then extracts a deterministic hash,
 * and then it applies a prefixed format to guarantee stable risk IDs across re-analyses.
 *
 * @param {string} category  - The risk category (e.g., 'QUALITY')
 * @param {string} title     - The risk title (e.g., 'High Cyclomatic Complexity')
 * @param {string} file      - The primary file path
 * @param {string} [name]    - Optional structural name (e.g., function name) for extra specificity
 */
function generateStableId(category, title, file, name = '') {
  const key = `${category}|${title}|${file || ''}|${name}`;
  return `risk_${stableHash(key)}`;
}

/**
 * It receives risk parameters, then extracts structured metadata,
 * and then it applies a stable deterministic ID to generate a consistent risk object.
 */
function createRisk(category, severity, title, description, file, evidence = {}, stableIdName = '') {
  const id = generateStableId(category, title, file, stableIdName);
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
    const fileComplexity = (file.symbols || []).reduce((sum, sym) => sum + (sym.complexity || 0), 0);

    if (file.lineCount > THRESHOLDS.FILE_LINES_HIGH && fileComplexity > THRESHOLDS.COMPLEXITY_HIGH) {
      risks.push(
        createRisk(
          RISK_CATEGORIES.SIZE,
          SEVERITY.HIGH,
          'Very large file',
          `File is unusually large (${file.lineCount} lines) and complex (score: ${fileComplexity}), suggesting multiple responsibilities.`,
          file.filePath,
          { lineCount: file.lineCount, complexity: fileComplexity, threshold: THRESHOLDS.FILE_LINES_HIGH }
        )
      );
    } else if (file.lineCount > THRESHOLDS.FILE_LINES_WARNING && fileComplexity > THRESHOLDS.COMPLEXITY_WARNING) {
      risks.push(
        createRisk(
          RISK_CATEGORIES.SIZE,
          SEVERITY.WARNING,
          'Large file',
          `File is large (${file.lineCount} lines) with elevated complexity (score: ${fileComplexity}).`,
          file.filePath,
          { lineCount: file.lineCount, complexity: fileComplexity, threshold: THRESHOLDS.FILE_LINES_WARNING }
        )
      );
    }

    const exportCount = (file.symbols || []).filter(s => s.kind === 'export').length;
    if (exportCount > THRESHOLDS.EXPORTS_WARNING) {
      risks.push(
        createRisk(
          RISK_CATEGORIES.SIZE,
          SEVERITY.WARNING,
          'Large public API surface',
          `File exports ${exportCount} symbols, suggesting an overly broad public interface.`,
          file.filePath,
          { exportCount, threshold: THRESHOLDS.EXPORTS_WARNING }
        )
      );
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
      risks.push(
        createRisk(
          RISK_CATEGORIES.COUPLING,
          SEVERITY.WARNING,
          'High fan-in (Central Module)',
          `Many modules (${deps.dependentCount}) depend on this file. Changes here carry high impact.`,
          file.filePath,
          { fanIn: deps.dependentCount, threshold: THRESHOLDS.FAN_IN_WARNING }
        )
      );
    }

    if (deps.dependencyCount > THRESHOLDS.FAN_OUT_WARNING) {
      risks.push(
        createRisk(
          RISK_CATEGORIES.COUPLING,
          SEVERITY.WARNING,
          'High fan-out (Dependency Bottleneck)',
          `File depends on many other modules (${deps.dependencyCount}), suggesting high coupling.`,
          file.filePath,
          { fanOut: deps.dependencyCount, threshold: THRESHOLDS.FAN_OUT_WARNING }
        )
      );
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
    risks.push(
      createRisk(
        RISK_CATEGORIES.DEPENDENCY,
        SEVERITY.CRITICAL,
        'Circular Dependency Detected',
        `Cycle path: ${cycle.join(' → ')}`,
        cycle[0],
        { cyclePath: cycle },
        cycle.join('>')
      )
    );
  }

  if (graph.meta && graph.meta.unresolvedImports > 0) {
    risks.push(
      createRisk(
        RISK_CATEGORIES.DEPENDENCY,
        SEVERITY.HIGH,
        'Unresolved Dependencies',
        `Repository contains ${graph.meta.unresolvedImports} unresolved import(s). This may indicate broken internal paths or missing external packages.`,
        null,
        { count: graph.meta.unresolvedImports }
      )
    );
  }

  const isolatedFiles = getIsolatedFiles(graph);
  for (const isolated of isolatedFiles) {
    risks.push(
      createRisk(
        RISK_CATEGORIES.DEPENDENCY,
        SEVERITY.WARNING,
        'Isolated Module',
        'File is neither imported by nor imports any other internal file.',
        isolated,
        {}
      )
    );
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
    risks.push(
      createRisk(
        RISK_CATEGORIES.ARCHITECTURE,
        violation.severity || SEVERITY.HIGH,
        'Cross-Layer Violation',
        violation.message || violation.description,
        violation.filePath,
        {
          sourceComp: violation.filePath,
          ruleId: violation.ruleId,
          // Pass the import location if available from the architecture analyzer
          location: violation.importLocation || null,
        },
        `${violation.filePath}>${violation.ruleId || ''}`
      )
    );
  }

  return risks;
}

/**
 * It aggregates function ASTs per file, then groups discontinuous complexity issues,
 * and then it applies a single grouped risk card per file with an instances array
 * so the UI can render each individual block separately.
 *
 * For Code Clones, each clone group becomes one risk card containing all sibling
 * file locations so the user can navigate to any copy.
 */
function analyzeCodeQualityRisks(analysis, graph) {
  const risks = [];
  const allFunctions = [];

  // ── Complexity: accumulate per file then group ─────────────────────────────
  // Map: filePath -> { high: Instance[], warning: Instance[] }
  const complexityByFile = new Map();

  if (analysis?.files) {
    for (const file of analysis.files) {
      if (file.hasErrors || file.error) continue;

      for (const sym of file.symbols || []) {
        if (['function', 'method', 'arrow'].includes(sym.kind)) {
          allFunctions.push({ ...sym, filePath: file.filePath });

          const isHigh = sym.complexity > THRESHOLDS.COMPLEXITY_HIGH;
          const isWarn = !isHigh && sym.complexity > THRESHOLDS.COMPLEXITY_WARNING;

          if (isHigh || isWarn) {
            if (!complexityByFile.has(file.filePath)) {
              complexityByFile.set(file.filePath, { high: [], warning: [] });
            }
            const bucket = complexityByFile.get(file.filePath);
            const instance = {
              name: sym.name,
              kind: sym.kind,
              complexity: sym.complexity,
              // location comes directly from the AST parser (startLine / endLine)
              location: sym.location || null,
            };
            if (isHigh) bucket.high.push(instance);
            else bucket.warning.push(instance);
          }
        }
      }
    }
  }

  // Emit one risk card per file per severity level
  for (const [filePath, { high, warning }] of complexityByFile.entries()) {
    if (high.length > 0) {
      // Sort worst-first inside the grouped card
      high.sort((a, b) => b.complexity - a.complexity);
      const worst = high[0];
      risks.push(
        createRisk(
          RISK_CATEGORIES.QUALITY,
          SEVERITY.HIGH,
          'High Cyclomatic Complexity',
          high.length === 1
            ? `${worst.kind} '${worst.name}' has a high complexity score of ${worst.complexity}. Consider refactoring.`
            : `${high.length} blocks in this file have high complexity (worst: '${worst.name}' at ${worst.complexity}). Consider breaking them apart.`,
          filePath,
          {
            // Primary location for the single-instance case — the worst offender's block
            location: worst.location,
            // Full instances list for the UI to render each block independently
            instances: high,
          },
          // Stable name: all names joined so that if the set of bad functions changes the ID changes too
          high
            .map(i => i.name)
            .sort()
            .join('+')
        )
      );
    }

    if (warning.length > 0) {
      warning.sort((a, b) => b.complexity - a.complexity);
      const worst = warning[0];
      risks.push(
        createRisk(
          RISK_CATEGORIES.QUALITY,
          SEVERITY.WARNING,
          'Elevated Complexity',
          warning.length === 1
            ? `${worst.kind} '${worst.name}' has a complexity score of ${worst.complexity}.`
            : `${warning.length} blocks in this file have elevated complexity (worst: '${worst.name}' at ${worst.complexity}).`,
          filePath,
          {
            location: worst.location,
            instances: warning,
          },
          warning
            .map(i => i.name)
            .sort()
            .join('+')
        )
      );
    }
  }

  // ── Code Clones ────────────────────────────────────────────────────────────
  const { cloneGroups } = detectClones(allFunctions, 'repository');
  if (cloneGroups) {
    for (const clone of cloneGroups) {
      // Each instance carries filePath + location from the clone analyzer
      const instances = clone.instances.map(inst => ({
        filePath: inst.filePath,
        name: inst.name,
        kind: inst.kind,
        location: inst.location || null,
      }));

      const filePaths = [...new Set(instances.map(i => i.filePath))];

      risks.push(
        createRisk(
          RISK_CATEGORIES.QUALITY,
          SEVERITY.WARNING,
          'Structural Code Clone',
          `Found ${clone.count} structurally identical blocks across ${filePaths.length} file(s). Extract to a shared utility to reduce duplication.`,
          instances[0]?.filePath || null,
          {
            count: clone.count,
            // Full sibling list with locations so the UI can link to each one
            instances,
          },
          // Stable: hash of sorted file paths
          filePaths.sort().join('+')
        )
      );
    }
  }

  // ── Dead / Unreachable Files ───────────────────────────────────────────────
  const reachability = analyzeReachability(graph);
  if (reachability?.unreachableFiles) {
    for (const deadFile of reachability.unreachableFiles) {
      if (deadFile.startsWith('pkg:') || deadFile.startsWith('moduleNode')) continue;

      const rawPath = deadFile.replace(/^file:/, '');
      risks.push(
        createRisk(
          RISK_CATEGORIES.QUALITY,
          SEVERITY.WARNING,
          'Dead / Unreachable File',
          'This file is never imported by any other file in the repository.',
          rawPath,
          {}
        )
      );
    }
  }

  return risks;
}

/**
 * It reduces the risk payload, then extracts the severity penalties,
 * and then it applies a final calculation for an overall health score.
 */
function calculateScoreAndLevel(risks, totalFiles = 1) {
  let penalty = 0;
  for (const risk of risks) {
    penalty += SEVERITY_PENALTY[risk.severity] || 0;
  }

  // Normalize penalty by repository size (baseline: 25 files)
  const sizeFactor = Math.max(1, totalFiles / 25);
  const normalizedPenalty = penalty / sizeFactor;

  // Exponential decay curve: makes the score forgiving for large codebases
  // and prevents it from immediately hitting 0.
  let score = Math.round(100 * Math.exp(-normalizedPenalty / 100));
  score = Math.max(0, Math.min(100, score));

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
    if (filePath.startsWith('.git/')) continue;

    const fileNode = analysis.files?.find(f => f.filePath === filePath);
    const compositeRisk = fileNode?.metrics?.compositeRisk || churnScore;

    if (compositeRisk >= THRESHOLDS.COMPOSITE_RISK_CRITICAL) {
      risks.push(
        createRisk(
          RISK_CATEGORIES.CHURN,
          SEVERITY.CRITICAL,
          'Critical Composite Risk (High Churn + High Complexity)',
          `This file has a composite risk score of ${compositeRisk}/100, driven by frequent changes (churn: ${churnScore}/100) combined with high cyclomatic complexity. It is the most likely source of regressions.`,
          filePath,
          { churnScore, compositeRisk, commitsModified: gitChurn.fileChurn?.[filePath] || 0 }
        )
      );
    } else if (compositeRisk >= THRESHOLDS.COMPOSITE_RISK_HIGH) {
      risks.push(
        createRisk(
          RISK_CATEGORIES.CHURN,
          SEVERITY.HIGH,
          'High Composite Risk (Churn + Complexity)',
          `This file has a composite risk score of ${compositeRisk}/100 (churn: ${churnScore}/100). Frequently modified complex files are hotspots for bugs.`,
          filePath,
          { churnScore, compositeRisk, commitsModified: gitChurn.fileChurn?.[filePath] || 0 }
        )
      );
    } else if (churnScore >= THRESHOLDS.CHURN_HIGH) {
      risks.push(
        createRisk(
          RISK_CATEGORIES.CHURN,
          SEVERITY.WARNING,
          'High Churn File',
          `This file is modified very frequently (churn score: ${churnScore}/100). Frequent changes may indicate unstable design or ongoing development.`,
          filePath,
          { churnScore, commitsModified: gitChurn.fileChurn?.[filePath] || 0 }
        )
      );
    }
  }

  return risks;
}

/**
 * It orchestrates the sub-analyzers, then extracts all potential failures,
 * and then it applies aggregation to build the comprehensive risk profile.
 *
 * @param {string[]} [ignoredRiskIds=[]]  — IDs the user has chosen to suppress.
 *   These are still returned in the `ignoredRisks` array so the UI can show them
 *   in a separate tab, but they are excluded from the score calculation.
 */
export function buildEngineeringRiskModel(analysis, graph, architecture, ignoredRiskIds = []) {
  const allRisks = [
    ...analyzeSizeRisks(analysis),
    ...analyzeCouplingRisks(analysis, graph),
    ...analyzeDependencyRisks(graph),
    ...analyzeArchitectureRisks(architecture),
    ...analyzeCodeQualityRisks(analysis, graph),
    ...analyzeChurnRisks(analysis),
  ];

  const ignoredSet = new Set(ignoredRiskIds);
  const risks = allRisks.filter(r => !ignoredSet.has(r.id));
  const ignoredRisks = allRisks.filter(r => ignoredSet.has(r.id));

  const totalFiles = Object.keys(analysis?.files || {}).length || 1;
  const { score, riskLevel } = calculateScoreAndLevel(risks, totalFiles);
  const hotspots = determineHotspots(risks);

  const metrics = {
    totalRisks: risks.length,
    totalFiles,
    critical: risks.filter(r => r.severity === SEVERITY.CRITICAL).length,
    high: risks.filter(r => r.severity === SEVERITY.HIGH).length,
    warning: risks.filter(r => r.severity === SEVERITY.WARNING).length,
  };

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
    summary: `Identified ${risks.length} active engineering risk(s) across the repository.`,
    score,
    riskLevel,
    metrics,
    hotspots,
    risks,
    ignoredRisks,
    churnTable,
    gitChurnAvailable: !!analysis?.gitChurn,
    recommendations: [],
  };
}

/**
 * It takes a set of ignored risk IDs, then recalculates the health score,
 * and then it returns the new score without rebuilding the full model.
 * Useful for instant UI updates when a user ignores/restores a single risk.
 */
export function recalculateScoreWithIgnored(allRisks, ignoredRiskIds, totalFiles = 1) {
  const ignoredSet = new Set(ignoredRiskIds);
  const activeRisks = allRisks.filter(r => !ignoredSet.has(r.id));
  const { score } = calculateScoreAndLevel(activeRisks, totalFiles);
  return score;
}

export { SEVERITY_PENALTY };
