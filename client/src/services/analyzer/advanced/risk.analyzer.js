/**
 * risk.analyzer.js
 *
 * It evaluates repository structures, then extracts dependency patterns,
 * and then it applies threshold heuristic rules to surface engineering risks.
 */

import { getFileDependencies, detectCycles, getIsolatedFiles } from '../dependencies/dependency.analyzer.js';
import { detectClones } from './clone.analyzer.js';
import { analyzeReachability } from './reachability.analyzer.js';
import { classifyHotspot, HOTSPOT_QUADRANTS } from './git.analyzer.js';
import { calculateInstability } from './architecture.analyzer.js';

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
  // FILE_LINES_HIGH / _WARNING are static fallbacks used only when the repo has
  // fewer than 4 files or all files have identical sizes — making IQR undefined.
  // Normal detection uses computeSizeThresholds() with Tukey IQR fences instead.
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
 * It collects the line counts from every file, then computes the
 * interquartile range (IQR) of the distribution, and then it derives
 * dynamic outlier fences so large-file detection is relative to the
 * actual codebase rather than a fixed hard-coded number.
 *
 * The classical Tukey outlier rules:
 *   outer fence  (extreme outlier) = Q3 + 3.0 × IQR  → "Very large file"
 *   inner fence  (mild outlier)    = Q3 + 1.5 × IQR  → "Large file"
 *
 * A minimum absolute floor prevents false positives on tiny repos
 * where every file is under 100 lines.
 */
function computeSizeThresholds(files) {
  const ABSOLUTE_FLOOR_HIGH = 300; // never flag as "Very large" below this
  const ABSOLUTE_FLOOR_WARNING = 150; // never flag as "Large" below this
  const MIN_SAMPLE_SIZE = 4; // need enough data for IQR to be meaningful

  if (!files || files.length < MIN_SAMPLE_SIZE) {
    // Fall back to legacy static thresholds for tiny repos
    return {
      high: THRESHOLDS.FILE_LINES_HIGH,
      warning: THRESHOLDS.FILE_LINES_WARNING,
      p50: 0,
      p75: 0,
      p25: 0,
      iqr: 0,
      method: 'static-fallback',
    };
  }

  const counts = files
    .map(f => f.lineCount || 0)
    .filter(n => n > 0)
    .sort((a, b) => a - b);

  if (counts.length < MIN_SAMPLE_SIZE) {
    return {
      high: THRESHOLDS.FILE_LINES_HIGH,
      warning: THRESHOLDS.FILE_LINES_WARNING,
      p50: 0,
      p75: 0,
      p25: 0,
      iqr: 0,
      method: 'static-fallback',
    };
  }

  const n = counts.length;

  const quantile = q => {
    const pos = q * (n - 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    if (lo === hi) return counts[lo];
    return counts[lo] + (counts[hi] - counts[lo]) * (pos - lo);
  };

  const p25 = quantile(0.25);
  const p50 = quantile(0.5);
  const p75 = quantile(0.75);
  const iqr = p75 - p25;

  // When IQR is 0 (all files have identical sizes) fall back to statics
  if (iqr === 0) {
    return {
      high: THRESHOLDS.FILE_LINES_HIGH,
      warning: THRESHOLDS.FILE_LINES_WARNING,
      p50,
      p75,
      p25,
      iqr,
      method: 'static-fallback-iqr-zero',
    };
  }

  const innerFence = Math.round(p75 + 1.5 * iqr);
  const outerFence = Math.round(p75 + 3.0 * iqr);

  return {
    high: Math.max(outerFence, ABSOLUTE_FLOOR_HIGH),
    warning: Math.max(innerFence, ABSOLUTE_FLOOR_WARNING),
    p50,
    p75,
    p25,
    iqr,
    method: 'iqr',
  };
}

/**
 * It iterates over the AST files, then computes dynamic size thresholds
 * using IQR-based statistical outlier detection, and then it applies
 * those repository-relative thresholds to identify bloated files.
 */
function analyzeSizeRisks(analysis) {
  const risks = [];

  if (!analysis?.files) return risks;

  const thresholds = computeSizeThresholds(analysis.files);

  for (const file of analysis.files) {
    const fileComplexity = (file.symbols || []).reduce((sum, sym) => sum + (sym.complexity || 0), 0);

    if (file.lineCount > thresholds.high && fileComplexity > THRESHOLDS.COMPLEXITY_HIGH) {
      risks.push(
        createRisk(
          RISK_CATEGORIES.SIZE,
          SEVERITY.HIGH,
          'Very large file',
          `At ${file.lineCount} lines this file is significantly larger than the rest of the codebase and carries high complexity (score: ${fileComplexity}). Consider splitting it into focused modules with single responsibilities.`,
          file.filePath,
          {
            lineCount: file.lineCount,
            complexity: fileComplexity,
            threshold: thresholds.high,
            p50: Math.round(thresholds.p50),
            p75: Math.round(thresholds.p75),
            iqr: Math.round(thresholds.iqr),
            detectionMethod: thresholds.method,
          }
        )
      );
    } else if (file.lineCount > thresholds.warning && fileComplexity > THRESHOLDS.COMPLEXITY_WARNING) {
      risks.push(
        createRisk(
          RISK_CATEGORIES.SIZE,
          SEVERITY.WARNING,
          'Large file',
          `At ${file.lineCount} lines this file is notably larger than most files in the repository and has elevated complexity (score: ${fileComplexity}). Review whether it can be decomposed into smaller, more focused units.`,
          file.filePath,
          {
            lineCount: file.lineCount,
            complexity: fileComplexity,
            threshold: thresholds.warning,
            p50: Math.round(thresholds.p50),
            p75: Math.round(thresholds.p75),
            iqr: Math.round(thresholds.iqr),
            detectionMethod: thresholds.method,
          }
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
 * It computes dynamic Tukey IQR outlier fences for fan-in (in-degree) and fan-out (out-degree)
 * across the repository, replacing rigid static constants with statistical distributions.
 *
 * Inner fence (warning outlier) = Q3 + 1.5 * IQR
 * Outer fence (high outlier)    = Q3 + 3.0 * IQR
 *
 * Absolute minimum floors prevent false positives on small repositories:
 *   Fan-in:  warning: 8,  high: 16
 *   Fan-out: warning: 10, high: 20
 *
 * Fallback for small sample size (< 4 files) or IQR == 0:
 *   Fan-in:  warning: 10, high: 20
 *   Fan-out: warning: 15, high: 25
 */
export function computeCouplingThresholds(analysis, graph) {
  const MIN_SAMPLE_SIZE = 4;
  const ABSOLUTE_FLOOR_FAN_IN_HIGH = 16;
  const ABSOLUTE_FLOOR_FAN_IN_WARNING = 8;
  const ABSOLUTE_FLOOR_FAN_OUT_HIGH = 20;
  const ABSOLUTE_FLOOR_FAN_OUT_WARNING = 10;

  const fallback = {
    fanIn: {
      high: 20,
      warning: 10,
      p25: 0,
      p50: 0,
      p75: 0,
      iqr: 0,
      method: 'static-fallback',
    },
    fanOut: {
      high: 25,
      warning: 15,
      p25: 0,
      p50: 0,
      p75: 0,
      iqr: 0,
      method: 'static-fallback',
    },
  };

  const files = analysis?.files;
  if (!files || files.length < MIN_SAMPLE_SIZE || !graph?.edges) {
    return fallback;
  }

  const fanInMap = new Map();
  const fanOutMap = new Map();

  for (const f of files) {
    fanInMap.set(f.filePath, 0);
    fanOutMap.set(f.filePath, 0);
  }

  for (const edge of graph.edges) {
    const s = (edge.source || '').replace(/^file:/, '');
    const t = (edge.target || '').replace(/^file:/, '');
    if (fanOutMap.has(s)) {
      fanOutMap.set(s, fanOutMap.get(s) + 1);
    }
    if (fanInMap.has(t)) {
      fanInMap.set(t, fanInMap.get(t) + 1);
    }
  }

  const fanInCounts = Array.from(fanInMap.values()).sort((a, b) => a - b);
  const fanOutCounts = Array.from(fanOutMap.values()).sort((a, b) => a - b);

  const getQuantiles = counts => {
    const n = counts.length;
    if (n < MIN_SAMPLE_SIZE) return null;
    const quantile = q => {
      const pos = q * (n - 1);
      const lo = Math.floor(pos);
      const hi = Math.ceil(pos);
      if (lo === hi) return counts[lo];
      return counts[lo] + (counts[hi] - counts[lo]) * (pos - lo);
    };
    const p25 = quantile(0.25);
    const p50 = quantile(0.5);
    const p75 = quantile(0.75);
    const iqr = p75 - p25;
    return { p25, p50, p75, iqr };
  };

  const qIn = getQuantiles(fanInCounts);
  const qOut = getQuantiles(fanOutCounts);

  let fanInResult;
  if (!qIn || qIn.iqr === 0) {
    fanInResult = {
      high: 20,
      warning: 10,
      p25: qIn?.p25 || 0,
      p50: qIn?.p50 || 0,
      p75: qIn?.p75 || 0,
      iqr: qIn?.iqr || 0,
      method: 'static-fallback-iqr-zero',
    };
  } else {
    const inner = Math.round(qIn.p75 + 1.5 * qIn.iqr);
    const outer = Math.round(qIn.p75 + 3.0 * qIn.iqr);
    fanInResult = {
      high: Math.max(outer, ABSOLUTE_FLOOR_FAN_IN_HIGH),
      warning: Math.max(inner, ABSOLUTE_FLOOR_FAN_IN_WARNING),
      p25: qIn.p25,
      p50: qIn.p50,
      p75: qIn.p75,
      iqr: qIn.iqr,
      method: 'iqr',
    };
  }

  let fanOutResult;
  if (!qOut || qOut.iqr === 0) {
    fanOutResult = {
      high: 25,
      warning: 15,
      p25: qOut?.p25 || 0,
      p50: qOut?.p50 || 0,
      p75: qOut?.p75 || 0,
      iqr: qOut?.iqr || 0,
      method: 'static-fallback-iqr-zero',
    };
  } else {
    const inner = Math.round(qOut.p75 + 1.5 * qOut.iqr);
    const outer = Math.round(qOut.p75 + 3.0 * qOut.iqr);
    fanOutResult = {
      high: Math.max(outer, ABSOLUTE_FLOOR_FAN_OUT_HIGH),
      warning: Math.max(inner, ABSOLUTE_FLOOR_FAN_OUT_WARNING),
      p25: qOut.p25,
      p50: qOut.p50,
      p75: qOut.p75,
      iqr: qOut.iqr,
      method: 'iqr',
    };
  }

  return { fanIn: fanInResult, fanOut: fanOutResult };
}

/**
 * It maps file paths against the dependency graph, then extracts their node degrees,
 * and then it applies dynamic Tukey IQR outlier fences to flag high coupling bottlenecks.
 */
function analyzeCouplingRisks(analysis, graph) {
  const risks = [];
  if (!analysis?.files || !graph?.edges) return risks;

  const thresholds = computeCouplingThresholds(analysis, graph);

  for (const file of analysis.files) {
    const deps = getFileDependencies(graph, file.filePath);

    if (deps.dependentCount > thresholds.fanIn.high) {
      risks.push(
        createRisk(
          RISK_CATEGORIES.COUPLING,
          SEVERITY.HIGH,
          'High fan-in (Central Bottleneck)',
          `Many modules (${deps.dependentCount}) depend on this file (outer IQR fence: ${thresholds.fanIn.high}). Changes here carry high architectural blast radius.`,
          file.filePath,
          {
            fanIn: deps.dependentCount,
            threshold: thresholds.fanIn.high,
            p50: Math.round(thresholds.fanIn.p50),
            p75: Math.round(thresholds.fanIn.p75),
            iqr: Math.round(thresholds.fanIn.iqr),
            detectionMethod: thresholds.fanIn.method,
          }
        )
      );
    } else if (deps.dependentCount > thresholds.fanIn.warning) {
      risks.push(
        createRisk(
          RISK_CATEGORIES.COUPLING,
          SEVERITY.WARNING,
          'High fan-in (Central Module)',
          `Many modules (${deps.dependentCount}) depend on this file (IQR fence: ${thresholds.fanIn.warning}). Changes here carry high impact.`,
          file.filePath,
          {
            fanIn: deps.dependentCount,
            threshold: thresholds.fanIn.warning,
            p50: Math.round(thresholds.fanIn.p50),
            p75: Math.round(thresholds.fanIn.p75),
            iqr: Math.round(thresholds.fanIn.iqr),
            detectionMethod: thresholds.fanIn.method,
          }
        )
      );
    }

    if (deps.dependencyCount > thresholds.fanOut.high) {
      risks.push(
        createRisk(
          RISK_CATEGORIES.COUPLING,
          SEVERITY.HIGH,
          'High fan-out (Severe Dependency Bottleneck)',
          `File depends on many other modules (${deps.dependencyCount}, outer IQR fence: ${thresholds.fanOut.high}), indicating high efferent coupling and fragility.`,
          file.filePath,
          {
            fanOut: deps.dependencyCount,
            threshold: thresholds.fanOut.high,
            p50: Math.round(thresholds.fanOut.p50),
            p75: Math.round(thresholds.fanOut.p75),
            iqr: Math.round(thresholds.fanOut.iqr),
            detectionMethod: thresholds.fanOut.method,
          }
        )
      );
    } else if (deps.dependencyCount > thresholds.fanOut.warning) {
      risks.push(
        createRisk(
          RISK_CATEGORIES.COUPLING,
          SEVERITY.WARNING,
          'High fan-out (Dependency Bottleneck)',
          `File depends on many other modules (${deps.dependencyCount}, IQR fence: ${thresholds.fanOut.warning}), suggesting high coupling.`,
          file.filePath,
          {
            fanOut: deps.dependencyCount,
            threshold: thresholds.fanOut.warning,
            p50: Math.round(thresholds.fanOut.p50),
            p75: Math.round(thresholds.fanOut.p75),
            iqr: Math.round(thresholds.fanOut.iqr),
            detectionMethod: thresholds.fanOut.method,
          }
        )
      );
    }
  }

  return risks;
}

/**
 * It calculates Robert C. Martin's Instability Index (I = Ce / (Ca + Ce)) for all files,
 * then checks for Stable Dependencies Principle (SDP) violations across file dependency edges.
 *
 * SDP Rule: Modules should depend in the direction of stability.
 * Violation: A stable module (I <= 0.3, Ca >= 3) depends on a volatile module (I >= 0.7, Ce >= 3).
 */
function analyzeStabilityRisks(analysis, graph) {
  const risks = [];
  if (!analysis?.files || !graph?.edges) return risks;

  const caMap = new Map();
  const ceMap = new Map();

  for (const f of analysis.files) {
    caMap.set(f.filePath, 0);
    ceMap.set(f.filePath, 0);
  }

  const internalEdges = [];
  for (const edge of graph.edges) {
    const s = (edge.source || '').replace(/^file:/, '');
    const t = (edge.target || '').replace(/^file:/, '');
    if (ceMap.has(s)) {
      ceMap.set(s, ceMap.get(s) + 1);
    }
    if (caMap.has(t)) {
      caMap.set(t, caMap.get(t) + 1);
    }
    if (caMap.has(s) && caMap.has(t) && s !== t) {
      internalEdges.push({ source: s, target: t });
    }
  }

  const stabilityMap = new Map();
  for (const f of analysis.files) {
    const ca = caMap.get(f.filePath) || 0;
    const ce = ceMap.get(f.filePath) || 0;
    const instability = calculateInstability(ca, ce);
    stabilityMap.set(f.filePath, { ca, ce, instability });
  }

  const violations = [];
  const seenPairs = new Set();

  for (const { source, target } of internalEdges) {
    const key = `${source}->${target}`;
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);

    const srcStat = stabilityMap.get(source);
    const tgtStat = stabilityMap.get(target);
    if (!srcStat || !tgtStat) continue;

    if (srcStat.instability <= 0.3 && srcStat.ca >= 3 && tgtStat.instability >= 0.7 && tgtStat.ce >= 3) {
      violations.push({
        source,
        target,
        srcStat,
        tgtStat,
      });
    }
  }

  violations.sort((a, b) => b.srcStat.ca + b.tgtStat.ce - (a.srcStat.ca + a.tgtStat.ce));
  const topViolations = violations.slice(0, 10);

  for (const v of topViolations) {
    risks.push(
      createRisk(
        RISK_CATEGORIES.ARCHITECTURE,
        SEVERITY.WARNING,
        'Stable Dependencies Principle Violation',
        `Stable module '${v.source}' (Instability: ${v.srcStat.instability}, Fan-in: ${v.srcStat.ca}) directly imports volatile module '${v.target}' (Instability: ${v.tgtStat.instability}, Fan-out: ${v.tgtStat.ce}). According to SDP, modules should depend in the direction of stability.`,
        v.source,
        {
          sourceFile: v.source,
          targetFile: v.target,
          sourceInstability: v.srcStat.instability,
          sourceFanIn: v.srcStat.ca,
          targetInstability: v.tgtStat.instability,
          targetFanOut: v.tgtStat.ce,
        },
        `${v.source}>${v.target}>sdp`
      )
    );
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
              cognitiveComplexity: sym.cognitiveComplexity || 0,
              nestingDepth: sym.nestingDepth || 0,
              maintainabilityIndex: sym.maintainabilityIndex || 100,
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
      high.sort((a, b) => (b.cognitiveComplexity || b.complexity) - (a.cognitiveComplexity || a.complexity));
      const worst = high[0];
      const nestingDetail = worst.nestingDepth > 1 ? `, nesting depth: ${worst.nestingDepth}` : '';
      const cognitiveDetail =
        worst.cognitiveComplexity > 0 ? ` (cognitive score: ${worst.cognitiveComplexity}${nestingDetail})` : '';

      risks.push(
        createRisk(
          RISK_CATEGORIES.QUALITY,
          SEVERITY.HIGH,
          'High Cyclomatic Complexity',
          high.length === 1
            ? `${worst.kind} '${worst.name}' has a high complexity score of ${worst.complexity}${cognitiveDetail}. Consider refactoring into flatter helper functions.`
            : `${high.length} blocks in this file have high complexity (worst: '${worst.name}' at ${worst.complexity}${cognitiveDetail}). Consider breaking them apart.`,
          filePath,
          {
            // Primary location for the single-instance case — the worst offender's block
            location: worst.location,
            // Full instances list for the UI to render each block independently
            instances: high,
            worstCognitive: worst.cognitiveComplexity,
            worstNesting: worst.nestingDepth,
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
      warning.sort((a, b) => (b.cognitiveComplexity || b.complexity) - (a.cognitiveComplexity || a.complexity));
      const worst = warning[0];
      const nestingDetail = worst.nestingDepth > 1 ? `, nesting depth: ${worst.nestingDepth}` : '';
      const cognitiveDetail =
        worst.cognitiveComplexity > 0 ? ` (cognitive score: ${worst.cognitiveComplexity}${nestingDetail})` : '';

      risks.push(
        createRisk(
          RISK_CATEGORIES.QUALITY,
          SEVERITY.WARNING,
          'Elevated Complexity',
          warning.length === 1
            ? `${worst.kind} '${worst.name}' has a complexity score of ${worst.complexity}${cognitiveDetail}.`
            : `${warning.length} blocks in this file have elevated complexity (worst: '${worst.name}' at ${worst.complexity}${cognitiveDetail}).`,
          filePath,
          {
            location: worst.location,
            instances: warning,
            worstCognitive: worst.cognitiveComplexity,
            worstNesting: worst.nestingDepth,
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

      const filePaths = clone.filePaths || [...new Set(instances.map(i => i.filePath))];
      const fileCount = filePaths.length;
      const linesInfo = clone.avgLines ? ` (~${clone.avgLines} lines each)` : '';

      const description =
        fileCount > 1
          ? `Found ${clone.count} structurally identical functions${linesInfo} across ${fileCount} files. Extract to a shared utility to eliminate duplicate maintenance.`
          : `Found ${clone.count} duplicate implementations${linesInfo} in this file. Consolidate into a shared helper function.`;

      risks.push(
        createRisk(
          RISK_CATEGORIES.QUALITY,
          SEVERITY.WARNING,
          'Structural Code Clone',
          description,
          instances[0]?.filePath || null,
          {
            count: clone.count,
            // Full sibling list with locations so the UI can link to each one
            instances,
            avgLines: clone.avgLines,
            complexity: clone.maxComplexity,
            linesDuplicated: clone.linesDuplicated,
            detectionMethod: clone.thresholds?.method || 'statistical-iqr',
          },
          // Stable: hash of sorted file paths
          filePaths.sort().join('+')
        )
      );
    }
  }

  // ── Dead / Unreachable Files & Unused Exports ─────────────────────────────
  const reachability = analyzeReachability(graph, analysis);
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
          {},
          rawPath
        )
      );
    }
  }

  if (reachability?.unusedExports && reachability.unusedExports.length > 0) {
    // Group unused exports by file
    const byFile = new Map();
    for (const exp of reachability.unusedExports) {
      if (!byFile.has(exp.filePath)) {
        byFile.set(exp.filePath, []);
      }
      byFile.get(exp.filePath).push(exp);
    }

    for (const [filePath, exportsList] of byFile.entries()) {
      const first = exportsList[0];
      const names = exportsList.map(e => `'${e.name}'`).join(', ');
      const desc =
        exportsList.length === 1
          ? `Exported ${first.kind} '${first.name}' is never imported anywhere in the repository.`
          : `${exportsList.length} exported symbols (${names}) are never imported anywhere in the repository.`;

      risks.push(
        createRisk(
          RISK_CATEGORIES.QUALITY,
          SEVERITY.WARNING,
          exportsList.length === 1 ? 'Unused Exported Symbol' : 'Unused Exported Symbols',
          desc,
          filePath,
          {
            location: first.location,
            instances: exportsList.map(e => ({
              name: e.name,
              kind: e.kind,
              location: e.location,
            })),
            unusedCount: exportsList.length,
            names: exportsList.map(e => e.name),
          },
          exportsList
            .map(e => e.name)
            .sort()
            .join('+')
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
    let p = SEVERITY_PENALTY[risk.severity] || 0;
    // Significantly reduced penalty for coupling issues (both static & temporal coupling: 1 point instead of 5)
    if (
      risk.category === RISK_CATEGORIES.COUPLING ||
      risk.title.includes('Coupling') ||
      risk.title.includes('Stable Dependencies')
    ) {
      p = 1;
    }
    penalty += p;
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
    let penalty = SEVERITY_PENALTY[risk.severity] || 0;
    if (
      risk.category === RISK_CATEGORIES.COUPLING ||
      risk.title.includes('Coupling') ||
      risk.title.includes('Stable Dependencies')
    ) {
      penalty = 1;
    }
    fileScores.set(risk.file, (fileScores.get(risk.file) || 0) + penalty);
  }

  return Array.from(fileScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(entry => entry[0]);
}

/**
 * It resolves historical git commit file paths against current repository files.
 * Handles relocated files (e.g. client/src/App.jsx -> client/src/app/App.jsx)
 * and returns null if the file was deleted in git history.
 */
function resolveCurrentFilePath(rawPath, availablePaths) {
  if (!rawPath || !availablePaths || availablePaths.size === 0) return null;
  const norm = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (availablePaths.has(norm)) return norm;
  if (availablePaths.has(rawPath)) return rawPath;

  const targetBase = norm.split('/').pop();
  const matches = [];
  for (const p of availablePaths) {
    if (p === norm || p.endsWith('/' + norm) || p.endsWith('/' + targetBase) || p === targetBase) {
      matches.push(p);
    }
  }

  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    const parts = norm.split('/');
    let best = matches[0];
    let bestScore = -1;
    for (const m of matches) {
      const mParts = m.split('/');
      let score = 0;
      for (const pt of parts) {
        if (mParts.includes(pt)) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }
    return best;
  }

  return null;
}

/**
 * It reads the gitChurn data from the analysis object, then extracts files
 * exceeding churn thresholds, and then it applies composite risk scoring
 * to surface the highest-priority files for review.
 */
function analyzeChurnRisks(analysis, graph) {
  const risks = [];
  const gitChurn = analysis?.gitChurn;
  if (!gitChurn || !gitChurn.churnScores) return risks;

  const filesList = Array.isArray(analysis?.files) ? analysis.files : Object.values(analysis?.files || {});
  const availablePaths = new Set(filesList.map(f => f.filePath).filter(Boolean));

  // 1. Tornhill Behavioral Hotspot Matrix & Churn Evaluation
  for (const [rawFilePath, churnScore] of Object.entries(gitChurn.churnScores)) {
    if (rawFilePath.startsWith('.git/')) continue;

    // Resolve path against current repository files; skip if deleted
    const resolvedPath = availablePaths.size > 0 ? resolveCurrentFilePath(rawFilePath, availablePaths) : rawFilePath;
    if (!resolvedPath) continue;

    const fileNode = filesList.find(f => f.filePath === resolvedPath);
    const complexity =
      fileNode?.metrics?.complexity ||
      (fileNode?.symbols ? fileNode.symbols.reduce((acc, s) => acc + (s.complexity || 0), 0) : 0);
    const complexityScore = Math.min(100, Math.round((complexity / 30) * 100));

    const hotspot = classifyHotspot(churnScore, complexityScore);
    const compositeRisk = fileNode?.metrics?.compositeRisk || Math.round(0.6 * complexityScore + 0.4 * churnScore);

    if (hotspot.quadrant === HOTSPOT_QUADRANTS.CRITICAL_HOTSPOT) {
      risks.push(
        createRisk(
          RISK_CATEGORIES.CHURN,
          SEVERITY.CRITICAL,
          'Behavioral Hotspot (Critical Active Risk)',
          `File is in the top quadrant of the Tornhill Hotspot Matrix: high churn (${churnScore}/100) combined with high complexity (${complexityScore}/100, score: ${hotspot.hotspotScore}). Frequently modified complex code is the primary source of regressions and defect leakage.`,
          resolvedPath,
          {
            churnScore,
            complexityScore,
            hotspotScore: hotspot.hotspotScore,
            quadrant: hotspot.quadrant,
            commitsModified: gitChurn.fileChurn?.[rawFilePath] || 0,
            originalPath: rawFilePath !== resolvedPath ? rawFilePath : undefined,
          },
          `${resolvedPath}>hotspot`
        )
      );
    } else if (compositeRisk >= THRESHOLDS.COMPOSITE_RISK_HIGH) {
      risks.push(
        createRisk(
          RISK_CATEGORIES.CHURN,
          SEVERITY.HIGH,
          'High Composite Risk (Churn + Complexity)',
          `This file has a composite risk score of ${compositeRisk}/100 (churn: ${churnScore}/100). Frequently modified complex files are hotspots for bugs.`,
          resolvedPath,
          {
            churnScore,
            compositeRisk,
            commitsModified: gitChurn.fileChurn?.[rawFilePath] || 0,
            originalPath: rawFilePath !== resolvedPath ? rawFilePath : undefined,
          },
          `${resolvedPath}>composite`
        )
      );
    } else if (churnScore >= THRESHOLDS.CHURN_HIGH) {
      risks.push(
        createRisk(
          RISK_CATEGORIES.CHURN,
          SEVERITY.WARNING,
          'High Churn File',
          `This file is modified very frequently (churn score: ${churnScore}/100). Frequent changes may indicate unstable design or ongoing development.`,
          resolvedPath,
          {
            churnScore,
            commitsModified: gitChurn.fileChurn?.[rawFilePath] || 0,
            originalPath: rawFilePath !== resolvedPath ? rawFilePath : undefined,
          },
          `${resolvedPath}>churn`
        )
      );
    }
  }

  // 2. Temporal Co-Change Coupling (Hidden Logical Coupling)
  if (gitChurn.coChanges && Array.isArray(gitChurn.coChanges)) {
    // Resolve all co-changes against existing files in the current repository
    const resolvedCouplings = [];
    for (const co of gitChurn.coChanges) {
      const { fileA, fileB, sharedCommits, jaccard } = co;
      if (!fileA || !fileB) continue;

      const resA = availablePaths.size > 0 ? resolveCurrentFilePath(fileA, availablePaths) : fileA;
      const resB = availablePaths.size > 0 ? resolveCurrentFilePath(fileB, availablePaths) : fileB;

      // Omit pairs where either file no longer exists or they resolve to the same file
      if (!resA || !resB || resA === resB) continue;

      resolvedCouplings.push({
        fileA: resA,
        fileB: resB,
        rawA: fileA,
        rawB: fileB,
        sharedCommits,
        jaccard,
      });
    }

    // Deduplicate pairs (e.g. if different historical paths mapped to the same modern paths)
    const seenPairs = new Set();
    const uniqueCouplings = [];
    for (const c of resolvedCouplings) {
      const pairKey = [c.fileA, c.fileB].sort().join('<->');
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);
      uniqueCouplings.push(c);
    }

    // Cap to top 10 strongest couplings to avoid card explosion
    const topCouplings = uniqueCouplings.slice(0, 10);
    for (const co of topCouplings) {
      const { fileA, fileB, sharedCommits, jaccard, rawA, rawB } = co;

      const hasDirectEdge = graph?.edges?.some(e => {
        const s = (e.source || '').replace(/^file:/, '');
        const t = (e.target || '').replace(/^file:/, '');
        return (
          (s === fileA && t === fileB) ||
          (s === fileB && t === fileA) ||
          (rawA && s === rawA && t === rawB) ||
          (rawA && s === rawB && t === rawA)
        );
      });

      if (!hasDirectEdge) {
        risks.push(
          createRisk(
            RISK_CATEGORIES.ARCHITECTURE,
            SEVERITY.HIGH,
            'Hidden Logical Coupling (Temporal Co-Change)',
            `Files '${fileA}' and '${fileB}' change together in ${sharedCommits} commits (${Math.round(jaccard * 100)}% co-change rate) without a direct import relationship. This suggests hidden coupling or missing architectural abstraction.`,
            fileA,
            {
              fileA,
              fileB,
              coupledFiles: [fileB],
              sharedCommits,
              jaccard,
              coChangeCount: sharedCommits,
              coChangeSimilarity: jaccard,
              originalFileA: rawA !== fileA ? rawA : undefined,
              originalFileB: rawB !== fileB ? rawB : undefined,
            },
            `${fileA}+${fileB}>cochange`
          )
        );
      }
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
    ...analyzeStabilityRisks(analysis, graph),
    ...analyzeDependencyRisks(graph),
    ...analyzeArchitectureRisks(architecture),
    ...analyzeCodeQualityRisks(analysis, graph),
    ...analyzeChurnRisks(analysis, graph),
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

  const availablePaths = new Set(
    (Array.isArray(analysis?.files) ? analysis.files : Object.values(analysis?.files || {}))
      .map(f => f.filePath)
      .filter(Boolean)
  );

  const churnTable = analysis?.gitChurn?.churnScores
    ? Object.entries(analysis.gitChurn.churnScores)
        .filter(([fp]) => !fp.startsWith('.git/'))
        .map(([rawFilePath, churnScore]) => {
          const resolvedPath =
            availablePaths.size > 0 ? resolveCurrentFilePath(rawFilePath, availablePaths) : rawFilePath;
          if (!resolvedPath) return null;
          const fileNode = Array.isArray(analysis?.files)
            ? analysis.files.find(f => f.filePath === resolvedPath)
            : analysis?.files?.[resolvedPath];
          return {
            filePath: resolvedPath,
            churnScore,
            compositeRisk: fileNode?.metrics?.compositeRisk || churnScore,
            commitsModified: analysis.gitChurn.fileChurn?.[rawFilePath] || 0,
          };
        })
        .filter(Boolean)
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
