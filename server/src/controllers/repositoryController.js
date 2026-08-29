const path = require('path');
const fs = require('fs');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

const repositoryStore    = require('../repositories/repositoryStore');
const { safeExtract }    = require('../utils/zipExtractor');
const { analyzeRepository } = require('../analyzers/repositoryAnalyzer');
const {
  buildDependencyGraph,
  getFileDependencies,
  getIsolatedFiles,
  detectCycles,
} = require('../analyzers/dependencyGraph');
const { detectLanguage } = require('../analyzers/languageDetector');

// ── POST /api/repository/upload ───────────────────────────────────────────────
async function upload(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Send a ZIP as multipart field "repository".' });
    }

    const id          = uuidv4();
    const name        = path.basename(req.file.originalname, '.zip');
    const extractPath = path.join(os.tmpdir(), `codelens_${id}`);

    // Store record immediately so the client can poll status
    repositoryStore.set(id, {
      id,
      name,
      uploadedAt: new Date(),
      status: 'pending',
      extractPath,
      analysis: null,
    });

    // Extract the ZIP safely (path-traversal protection inside)
    try {
      await safeExtract(req.file.path, extractPath);
    } catch (extractErr) {
      repositoryStore.update(id, { status: 'error', error: extractErr.message });
      return res.status(422).json({ error: `ZIP extraction failed: ${extractErr.message}` });
    }

    // Begin AST analysis (async — do not block the HTTP response)
    repositoryStore.update(id, { status: 'analyzing' });
    setImmediate(async () => {
      try {
        const analysis = await analyzeRepository(extractPath);
        repositoryStore.update(id, { status: 'ready', analysis });
      } catch (err) {
        console.error(`[repositoryController] Analysis failed for ${id}:`, err);
        repositoryStore.update(id, { status: 'error', error: err.message });
      }
    });

    // Respond immediately — client polls GET /:id for status
    return res.status(201).json({ id, name, status: 'analyzing' });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/repository/:id ───────────────────────────────────────────────────
function getRepository(req, res) {
  const record = repositoryStore.get(req.params.id);
  if (!record) return res.status(404).json({ error: 'Repository not found' });
  // Don't expose internal filesystem paths to the client
  const { extractPath: _x, ...safe } = record;
  return res.json(safe);
}

// ── GET /api/repository/:id/files ─────────────────────────────────────────────
function listFiles(req, res) {
  const record = repositoryStore.get(req.params.id);
  if (!record) return res.status(404).json({ error: 'Repository not found' });
  if (record.status !== 'ready') return res.status(409).json({ error: 'Repository not ready', status: record.status });

  const tree = buildFileTree(record.extractPath, record.extractPath);
  return res.json({ id: record.id, name: record.name, tree });
}

// ── GET /api/repository/:id/analysis ──────────────────────────────────────────
function getAnalysis(req, res) {
  const record = repositoryStore.get(req.params.id);
  if (!record) return res.status(404).json({ error: 'Repository not found' });
  if (record.status === 'analyzing') return res.status(202).json({ status: 'analyzing' });
  if (record.status !== 'ready') return res.status(409).json({ error: 'Repository not ready', status: record.status });
  if (!record.analysis) return res.status(404).json({ error: 'Analysis not available' });

  // Return the analysis without the rootDir (internal path)
  const { rootDir: _r, ...safeAnalysis } = record.analysis;
  return res.json(safeAnalysis);
}

// ── GET /api/repository/:id/analysis/file ─────────────────────────────────────
// query: ?path=relative/path/to/file
function getFileAnalysis(req, res) {
  const record = repositoryStore.get(req.params.id);
  if (!record) return res.status(404).json({ error: 'Repository not found' });
  if (record.status !== 'ready') return res.status(409).json({ error: 'Repository not ready', status: record.status });
  if (!record.analysis) return res.status(404).json({ error: 'Analysis not available' });

  const requestedPath = req.query.path;
  if (!requestedPath) return res.status(400).json({ error: 'Query parameter "path" is required' });

  const fileAnalysis = record.analysis.files.find(f => f.filePath === requestedPath);
  if (!fileAnalysis) return res.status(404).json({ error: 'No analysis found for this file' });

  return res.json(fileAnalysis);
}

// ── GET /api/repository/:id/file?path=… ───────────────────────────────────────
function getFile(req, res) {
  const record = repositoryStore.get(req.params.id);
  if (!record) return res.status(404).json({ error: 'Repository not found' });
  if (record.status !== 'ready') return res.status(409).json({ error: 'Repository not ready' });

  const requestedRelative = req.query.path;
  if (!requestedRelative) return res.status(400).json({ error: 'Query parameter "path" is required' });

  // Path-traversal guard: resolved path must stay within extractPath
  const resolved = path.resolve(record.extractPath, requestedRelative);
  if (!resolved.startsWith(record.extractPath + path.sep) && resolved !== record.extractPath) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'File not found' });

  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) return res.status(400).json({ error: 'Path is a directory, not a file' });

  // Refuse files larger than 2 MB to avoid sending huge payloads
  const MAX_BYTES = 2 * 1024 * 1024;
  if (stat.size > MAX_BYTES) {
    return res.status(413).json({ error: 'File too large to display (> 2 MB)' });
  }

  const content = fs.readFileSync(resolved, 'utf8');
  // Derive Monaco language hint from the file extension.
  // Falls back to null for files unsupported by the analyzer (CSS, JSON, etc.) —
  // the frontend applies its own Monaco language mapping in that case.
  const language = detectLanguage(requestedRelative);
  return res.json({ path: requestedRelative, content, size: stat.size, language });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Recursively builds a file-tree node structure.
 * @param {string} dir      — absolute path of current directory
 * @param {string} rootPath — absolute path of repo root (for relative path computation)
 * @returns {TreeNode[]}
 */
function buildFileTree(dir, rootPath) {
  const IGNORE = new Set([
    'node_modules', '.git', '.svn', '__pycache__', '.DS_Store',
    'dist', 'build', 'coverage', '.next', '.nuxt', '.cache',
    'vendor', 'bower_components',
  ]);

  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const nodes = [];
  for (const entry of entries) {
    if (IGNORE.has(entry.name)) continue;

    const absPath = path.join(dir, entry.name);
    const relPath = path.relative(rootPath, absPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      nodes.push({
        type: 'directory',
        name: entry.name,
        path: relPath,
        children: buildFileTree(absPath, rootPath),
      });
    } else if (entry.isFile()) {
      nodes.push({
        type: 'file',
        name: entry.name,
        path: relPath,
        extension: path.extname(entry.name).toLowerCase(),
      });
    }
  }

  // Directories first, then files, both alphabetical
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return nodes;
}

// ── GET /api/repository/:id/graph ─────────────────────────────────────────────
function getDependencyGraph(req, res) {
  const record = repositoryStore.get(req.params.id);
  if (!record) return res.status(404).json({ error: 'Repository not found' });
  if (record.status === 'analyzing') return res.status(202).json({ status: 'analyzing' });
  if (record.status !== 'ready') return res.status(409).json({ error: 'Repository not ready', status: record.status });
  if (!record.analysis) return res.status(404).json({ error: 'Analysis not available' });

  try {
    const graph = buildDependencyGraph(record.analysis);

    // Optionally attach cycle and isolated-file info
    const cycles   = detectCycles(graph);
    const isolated = getIsolatedFiles(graph);

    return res.json({ ...graph, cycles, isolatedFiles: isolated });
  } catch (err) {
    return res.status(500).json({ error: `Graph build failed: ${err.message}` });
  }
}

// ── GET /api/repository/:id/graph/file ────────────────────────────────────────
// query: ?path=relative/path/to/file
function getFileDependencyInfo(req, res) {
  const record = repositoryStore.get(req.params.id);
  if (!record) return res.status(404).json({ error: 'Repository not found' });
  if (record.status !== 'ready') return res.status(409).json({ error: 'Repository not ready', status: record.status });
  if (!record.analysis) return res.status(404).json({ error: 'Analysis not available' });

  const requestedPath = req.query.path;
  if (!requestedPath) return res.status(400).json({ error: 'Query parameter "path" is required' });

  // Verify file exists in analysis
  const fileAnalysis = record.analysis.files.find(f => f.filePath === requestedPath);
  if (!fileAnalysis) return res.status(404).json({ error: 'No analysis found for this file' });

  try {
    const graph = buildDependencyGraph(record.analysis);
    const info  = getFileDependencies(graph, requestedPath);
    return res.json(info);
  } catch (err) {
    return res.status(500).json({ error: `Graph query failed: ${err.message}` });
  }
}

module.exports = {
  upload,
  getRepository,
  listFiles,
  getFile,
  getAnalysis,
  getFileAnalysis,
  getDependencyGraph,
  getFileDependencyInfo,
};
