'use strict';

const repositoryStore = require('../repositories/repositoryStore');
const { buildDependencyGraph } = require('../analyzers/dependencyGraph');
const { buildArchitectureModel } = require('../analyzers/architectureAnalyzer');
const { buildRepositoryIntelligence } = require('../analyzers/repositoryIntelligence');

/**
 * Controller for Unified Repository Intelligence.
 */

async function getIntelligence(req, res, next) {
  try {
    const record = repositoryStore.get(req.params.id);
    
    if (record && record.status === 'analyzing') {
      return res.status(202).json({ 
        status: 'analyzing', 
        phase: record.phase,
        phaseDetails: record.phaseDetails
      });
    }

    if (!record) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    if (record.status !== 'ready' || !record.analysis) {
       return res.status(503).json({ 
          error: 'Analysis not ready',
          status: record.status 
       });
    }

    const graph = buildDependencyGraph(record.analysis);
    const architecture = buildArchitectureModel(record.analysis, graph);
    
    const intelligence = buildRepositoryIntelligence(record.analysis, graph, architecture);

    return res.json(intelligence);
  } catch (err) {
    console.error('[repositoryIntelligenceController] getIntelligence failed:', err);
    next(err);
  }
}

module.exports = {
  getIntelligence
};
