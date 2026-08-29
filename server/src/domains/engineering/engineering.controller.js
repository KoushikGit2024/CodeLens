'use strict';

const repositoryStore = require('../repository/repository.store');
const { buildDependencyGraph } = require('../dependencies/dependency.analyzer');
const { buildArchitectureModel } = require('../architecture/architecture.analyzer');
const { buildEngineeringRiskModel } = require('./risk.analyzer');
const { getEngineeringInsights } = require('../assistant/generators/engineering.insights');

/**
 * engineeringHealthController.js
 * 
 * Exposes endpoints for deterministic engineering risk models and AI insights.
 */

function getRisks(req, res, next) {
  try {
    const record = repositoryStore.get(req.params.id);
    if (!record) return res.status(404).json({ error: 'Repository not found' });
    if (record.status === 'analyzing') return res.status(202).json({ status: 'analyzing' });
    if (record.status !== 'ready') return res.status(409).json({ error: 'Repository not ready', status: record.status });
    if (!record.analysis) return res.status(404).json({ error: 'Analysis not available' });

    const graph = buildDependencyGraph(record.analysis);
    const architecture = buildArchitectureModel(record.analysis, graph);
    const riskModel = buildEngineeringRiskModel(record.analysis, graph, architecture);

    return res.json(riskModel);
  } catch (err) {
    console.error('[engineeringHealthController] getRisks failed:', err);
    next(err);
  }
}

async function getAiInsights(req, res, next) {
  try {
    const record = repositoryStore.get(req.params.id);
    if (!record) return res.status(404).json({ error: 'Repository not found' });
    if (record.status === 'analyzing') return res.status(202).json({ status: 'analyzing' });
    if (record.status !== 'ready') return res.status(409).json({ error: 'Repository not ready', status: record.status });
    if (!record.analysis) return res.status(404).json({ error: 'Analysis not available' });

    const graph = buildDependencyGraph(record.analysis);
    const architecture = buildArchitectureModel(record.analysis, graph);
    const riskModel = buildEngineeringRiskModel(record.analysis, graph, architecture);

    const insights = await getEngineeringInsights(riskModel, architecture, graph.meta);
    
    return res.json(insights);
  } catch (err) {
    console.error('[engineeringHealthController] getAiInsights failed:', err);
    next(err);
  }
}

module.exports = {
  getRisks,
  getAiInsights
};
