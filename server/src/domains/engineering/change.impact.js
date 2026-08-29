'use strict';

const { getFileDependencies, fileNodeId } = require('../dependencies/dependency.analyzer');
const { buildArchitectureModel } = require('../architecture/architecture.analyzer');

/**
 * changeImpact.js
 *
 * Implements deterministic change impact analysis. Given a set of changed files,
 * determines the direct and transitive dependents, as well as the affected
 * architectural components.
 */

/**
 * Perform a change impact analysis for a given set of changed file paths.
 *
 * @param {object} analysis - RepositoryAnalysis
 * @param {object} graph - DependencyGraph
 * @param {string[]} changedFiles - Array of relative file paths that changed
 * @returns {object} The impact report
 */
function analyzeChangeImpact(analysis, graph, changedFiles) {
  const architecture = buildArchitectureModel(analysis, graph);

  const directlyAffectedFiles = new Set();
  const transitivelyAffectedFiles = new Set();

  // Find direct dependents for all changed files
  for (const changedFile of changedFiles) {
    const deps = getFileDependencies(graph, changedFile);
    for (const dependent of deps.dependents) {
      if (!changedFiles.includes(dependent.filePath)) {
        directlyAffectedFiles.add(dependent.filePath);
      }
    }
  }

  // Find transitive dependents using BFS from direct dependents
  const queue = Array.from(directlyAffectedFiles);
  const visited = new Set(changedFiles); // Treat changed as visited so we don't count them
  
  // also add directly affected to visited to avoid double counting them in transitive
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

  // Find affected components
  const affectedComponents = new Set();
  const allAffected = new Set([...changedFiles, ...directlyAffectedFiles, ...transitivelyAffectedFiles]);

  for (const component of architecture.components) {
    const componentHasAffectedFile = component.files.some(f => allAffected.has(f));
    if (componentHasAffectedFile) {
      affectedComponents.add(component.name);
    }
  }

  return {
    changedFiles: Array.from(changedFiles).sort(),
    directlyAffectedFiles: Array.from(directlyAffectedFiles).sort(),
    transitivelyAffectedFiles: Array.from(transitivelyAffectedFiles).sort(),
    affectedComponents: Array.from(affectedComponents).sort(),
  };
}

module.exports = {
  analyzeChangeImpact,
};
