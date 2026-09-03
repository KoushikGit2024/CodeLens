'use strict';

const repositoryStore = require('../repository/repository.store');
const { analyzeRepository } = require('../repository/repository.analyzer');
const { buildDependencyGraph, detectCycles } = require('../dependencies/dependency.analyzer');
const { analyzeChangeImpact } = require('./change.impact');
const { buildArchitectureModel } = require('../architecture/architecture.analyzer');
const { buildEngineeringRiskModel } = require('./risk.analyzer');
const { buildRefactoringIntelligence } = require('./refactoring.analyzer');
const { buildRepositoryIntelligence } = require('../repository/intelligence.analyzer');

/**
 * ciController.js
 *
 * Exposes CI-oriented endpoints for incremental analysis, change impact,
 * and machine-readable CI reports.
 */

async function analyze(req, res, next) {
  try {
    const record = repositoryStore.get(req.params.id);
    if (!record) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    const mode = req.body?.mode || 'incremental';
    
    // We can only do incremental if an analysis already exists.
    const previousAnalysis = (mode === 'incremental' && record.analysis) ? record.analysis : null;

    // Update status
    repositoryStore.update(record.id, { status: 'analyzing' });

    // Perform analysis
    const newAnalysis = await analyzeRepository(
      record.extractPath, 
      previousAnalysis,
      (phase, details) => repositoryStore.update(record.id, { phase, phaseDetails: details }),
      { ignorePatterns: record.ignorePatterns || [] }
    );

    if (newAnalysis.status === 'error') {
      repositoryStore.update(record.id, { status: 'error', error: newAnalysis.error });
      return res.status(500).json({ error: newAnalysis.error });
    }

    // Determine changed files based on metadata delta
    // A file is changed if it is in newAnalysis but has a different hash than previousAnalysis.
    // Or if it was added or deleted. We'll find out the exact list of modified/added files by comparing hashes
    const changedFiles = [];
    if (previousAnalysis && previousAnalysis.files) {
      for (const newFile of newAnalysis.files) {
        const oldFile = previousAnalysis.files.find(f => f.filePath === newFile.filePath);
        if (!oldFile || oldFile.hash !== newFile.hash) {
          changedFiles.push(newFile.filePath);
        }
      }
      for (const oldFile of previousAnalysis.files) {
        if (!newAnalysis.files.find(f => f.filePath === oldFile.filePath)) {
          changedFiles.push(oldFile.filePath);
        }
      }
    } else {
      // In full mode, all files are 'changed' conceptually, but we can return [] or all files.
      // Usually CI only cares about diffs. We'll return all if it's the first run.
      changedFiles.push(...newAnalysis.files.map(f => f.filePath));
    }

    // Save to store, but also save changedFiles list for the impact endpoint
    repositoryStore.update(record.id, { 
      status: 'ready', 
      analysis: newAnalysis, 
      analysisVersion: newAnalysis.meta.analysisVersion,
      lastChangedFiles: changedFiles
    });

    return res.json({
      status: 'ready',
      version: newAnalysis.meta.analysisVersion,
      meta: newAnalysis.meta
    });
  } catch (err) {
    console.error('[ciController] Analyze failed:', err);
    next(err);
  }
}

async function getImpact(req, res, next) {
  try {
    const record = repositoryStore.get(req.params.id);
    if (!record || !record.analysis) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    const changedFiles = record.lastChangedFiles || [];
    const graph = buildDependencyGraph(record.analysis);
    
    const impact = analyzeChangeImpact(record.analysis, graph, changedFiles);

    return res.json(impact);
  } catch (err) {
    console.error('[ciController] Impact failed:', err);
    next(err);
  }
}

async function getCiReport(req, res, next) {
  try {
    const record = repositoryStore.get(req.params.id);
    if (!record || !record.analysis) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    const graph = buildDependencyGraph(record.analysis);
    const cycles = detectCycles(graph);
    
    const changedFiles = record.lastChangedFiles || [];
    const impact = analyzeChangeImpact(record.analysis, graph, changedFiles);

    const architecture = buildArchitectureModel(record.analysis, graph);
    const engineeringHealth = buildEngineeringRiskModel(record.analysis, graph, architecture);
    const refactoringIntel = buildRefactoringIntelligence(engineeringHealth);
    const unifiedIntel = buildRepositoryIntelligence(record.analysis, graph, architecture);

    const report = {
      status: (cycles.length > 0 || graph.meta.unresolvedImports > 0 || engineeringHealth.score < 50) ? 'fail' : 'pass',
      summary: `Analysis Version ${record.analysis.meta.analysisVersion}`,
      changedFiles: changedFiles,
      engineeringHealth: {
        score: engineeringHealth.score,
        riskLevel: engineeringHealth.riskLevel,
        metrics: engineeringHealth.metrics
      },
      refactoring: {
        candidateCount: refactoringIntel.candidateCount,
        critical: refactoringIntel.critical,
        high: refactoringIntel.high,
        topPriorityScore: refactoringIntel.topPriorityScore
      },
      dependencyCycles: cycles,
      unresolvedImports: graph.meta.unresolvedImports,
      architectureIssues: [], // Placeholder for future rules
      documentationImpact: impact.affectedComponents, // Components whose docs might need an update
      intelligence: {
        healthScore: unifiedIntel.engineeringHealth.score,
        criticalRisks: unifiedIntel.engineeringHealth.critical,
        refactoringCandidates: unifiedIntel.refactoring.candidateCount,
        topHotspot: unifiedIntel.hotspots.length > 0 ? unifiedIntel.hotspots[0].filePath : null
      },
      analysisVersion: record.analysis.meta.analysisVersion,
      meta: record.analysis.meta
    };

    return res.json(report);
  } catch (err) {
    console.error('[ciController] CI Report failed:', err);
    next(err);
  }
}

module.exports = {
  analyze,
  getImpact,
  getCiReport
};
