/**
 * change.impact.js
 *
 * It initiates the change impact workflow, then extracts direct and transitive dependencies,
 * and then it applies architectural bounds to calculate the blast radius.
 */

import { getFileDependencies } from '../dependencies/dependency.analyzer.js';
import { buildArchitectureModel } from './architecture.analyzer.js';
import { createAnalysisFinding } from '../parsing/symbols.js';

/**
 * It processes the changed files array, then extracts their direct graph dependents,
 * and then it applies a Breadth-First Search (BFS) to map the transitive ripple effect.
 */
export function analyzeChangeImpact(analysis, graph, changedFiles) {
  const architecture = buildArchitectureModel(analysis, graph);

  const directlyAffectedFiles = new Set();
  const transitivelyAffectedFiles = new Set();

  for (const changedFile of changedFiles) {
    const deps = getFileDependencies(graph, changedFile);
    for (const dependent of deps.dependents) {
      if (!changedFiles.includes(dependent.filePath)) {
        directlyAffectedFiles.add(dependent.filePath);
      }
    }
  }

  const queue = Array.from(directlyAffectedFiles);
  const visited = new Set(changedFiles);

  for (const f of directlyAffectedFiles) visited.add(f);

  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    const deps = getFileDependencies(graph, current);

    for (const dependent of deps.dependents) {
      if (!visited.has(dependent.filePath)) {
        visited.add(dependent.filePath);
        transitivelyAffectedFiles.add(dependent.filePath);
        queue.push(dependent.filePath);
      }
    }
  }

  const affectedComponents = new Set();
  const allAffected = new Set([...changedFiles, ...directlyAffectedFiles, ...transitivelyAffectedFiles]);

  for (const component of architecture.layers) {
    // Note: layers is the Array of AnalysisNode components built in architecture.analyzer
    const componentFiles = graph.nodes
      .filter(n => n.type === 'fileNode' && n.data.layer === component.data.layer)
      .map(n => n.data.filePath);

    const componentHasAffectedFile = componentFiles.some(f => allAffected.has(f));
    if (componentHasAffectedFile) {
      affectedComponents.add(component.data.label);
    }
  }

  const findings = [];

  // It evaluates the transitive size, then extracts cases exceeding a safety threshold, and then it applies a risk finding.
  if (transitivelyAffectedFiles.size > 10) {
    findings.push(
      createAnalysisFinding({
        id: `IMPACT-WIDE-BLAST-${changedFiles[0]}`,
        analyzerId: 'impact',
        ruleId: 'WIDE_BLAST_RADIUS',
        category: 'architecture',
        severity: 'warning',
        title: 'High Change Impact',
        message: `Modifying ${changedFiles.join(', ')} affects ${transitivelyAffectedFiles.size} downstream files. Consider extracting shared logic.`,
        filePath: changedFiles[0],
        range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 },
      })
    );
  }

  return {
    changedFiles: Array.from(changedFiles).sort(),
    directlyAffectedFiles: Array.from(directlyAffectedFiles).sort(),
    transitivelyAffectedFiles: Array.from(transitivelyAffectedFiles).sort(),
    affectedComponents: Array.from(affectedComponents).sort(),
    findings,
  };
}
