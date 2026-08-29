'use strict';

const repositoryStore = require('../repositories/repositoryStore');
const { buildDependencyGraph } = require('../analyzers/dependencyGraph');
const { buildArchitectureModel } = require('../analyzers/architectureAnalyzer');
const { generateOverviewDocs, generateModuleDocs } = require('../ai/documentationGenerator');

// ── In-Memory Document Cache (Simple) ──────────────────────────────────────────
// Structure: cache[repoId] = { overview: {...}, modules: { 'path/to/file': {...} } }
const docCache = new Map();

function getRepoCache(repoId) {
  if (!docCache.has(repoId)) {
    docCache.set(repoId, { overview: null, modules: {} });
  }
  return docCache.get(repoId);
}

// ── GET /api/repository/:id/documentation/overview ────────────────────────────

async function getOverviewDocumentation(req, res, next) {
  try {
    const record = repositoryStore.get(req.params.id);
    if (!record) return res.status(404).json({ error: 'Repository not found' });
    if (record.status !== 'ready') return res.status(409).json({ error: 'Repository not ready', status: record.status });
    if (!record.analysis) return res.status(404).json({ error: 'Analysis not available' });

    const cache = getRepoCache(req.params.id);
    if (cache.overview) {
      return res.json(cache.overview);
    }

    const graph = buildDependencyGraph(record.analysis);
    const architectureModel = buildArchitectureModel(record.analysis, graph);

    const docs = await generateOverviewDocs(record.analysis, graph, architectureModel);
    cache.overview = docs; // save to cache

    return res.json(docs);
  } catch (err) {
    next(err);
  }
}

// ── GET /api/repository/:id/documentation/file?path=... ───────────────────────

async function getModuleDocumentation(req, res, next) {
  try {
    const record = repositoryStore.get(req.params.id);
    if (!record) return res.status(404).json({ error: 'Repository not found' });
    if (record.status !== 'ready') return res.status(409).json({ error: 'Repository not ready', status: record.status });
    if (!record.analysis) return res.status(404).json({ error: 'Analysis not available' });

    const requestedPath = req.query.path;
    if (!requestedPath) return res.status(400).json({ error: 'Query parameter "path" is required' });

    // Verify file exists in analysis (non-source files like .gitignore are skipped)
    const fileAnalysis = record.analysis.files.find(f => f.filePath === requestedPath);
    if (!fileAnalysis) {
      return res.json({
        unsupported: true,
        path: requestedPath,
        reason: 'This file type is not parsed by CodeLens (e.g. config, asset, or binary file).'
      });
    }

    const cache = getRepoCache(req.params.id);
    if (cache.modules[requestedPath]) {
      return res.json(cache.modules[requestedPath]);
    }

    const graph = buildDependencyGraph(record.analysis);
    const architectureModel = buildArchitectureModel(record.analysis, graph);

    const docs = await generateModuleDocs(record.analysis, graph, architectureModel, requestedPath);
    cache.modules[requestedPath] = docs; // save to cache

    return res.json(docs);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getOverviewDocumentation,
  getModuleDocumentation,
};
