/**
 * askController.js
 *
 * Handles POST /api/repository/:id/ask
 *
 * Flow:
 *   1. Validate request (repository exists, ready, question provided)
 *   2. Build AiContext from repository analysis + dependency graph
 *   3. Assemble prompt
 *   4. Call AI provider
 *   5. Return structured response
 *
 * Error handling:
 *   - Repository not found → 404
 *   - Repository still analyzing → 202
 *   - Repository not ready → 409
 *   - Empty question → 400
 *   - AI provider not configured → 503
 *   - AI provider call failure → 502
 *   - Context build failure → 500
 */

'use strict';

const repositoryStore  = require('../repositories/repositoryStore');
const { buildContext, buildPrompt } = require('../ai/contextBuilder');
const { generateAnswer, isProviderConfigured, ProviderUnavailableError } = require('../ai/aiProvider');

// ── POST /api/repository/:id/ask ──────────────────────────────────────────────

async function ask(req, res) {
  // ── Validate repository ────────────────────────────────────────────────────
  const record = repositoryStore.get(req.params.id);
  if (!record) {
    return res.status(404).json({ error: 'Repository not found' });
  }
  if (record.status === 'analyzing') {
    return res.status(202).json({ error: 'Repository is still being analyzed. Try again shortly.', status: 'analyzing' });
  }
  if (record.status !== 'ready') {
    return res.status(409).json({ error: 'Repository not ready', status: record.status });
  }
  if (!record.analysis) {
    return res.status(404).json({ error: 'Analysis not available' });
  }

  // ── Validate question ──────────────────────────────────────────────────────
  const question = (req.body?.question || '').trim();
  if (!question) {
    return res.status(400).json({ error: 'Request body must include a non-empty "question" field.' });
  }
  if (question.length > 2000) {
    return res.status(400).json({ error: 'Question is too long (max 2000 characters).' });
  }

  // ── Check provider availability (fast path before building context) ────────
  if (!isProviderConfigured()) {
    return res.status(503).json({
      error: 'AI provider is not configured. Set IBM_API_KEY and IBM_PROJECT_ID in the server .env file.',
      configured: false,
    });
  }

  // ── Build context ──────────────────────────────────────────────────────────
  let context;
  try {
    // Attach the repository name to the analysis object so contextBuilder can use it
    const analysisWithName = { ...record.analysis, name: record.name };
    context = buildContext(analysisWithName, question, record.extractPath);
  } catch (err) {
    console.error('[askController] Context build failed:', err);
    return res.status(500).json({ error: `Failed to build repository context: ${err.message}` });
  }

  // ── Assemble prompt and call AI ────────────────────────────────────────────
  const prompt = buildPrompt(context);

  let answer;
  try {
    answer = await generateAnswer(prompt);
  } catch (err) {
    if (err instanceof ProviderUnavailableError) {
      return res.status(503).json({ error: err.message, configured: false });
    }
    console.error('[askController] AI provider call failed:', err);
    return res.status(502).json({ error: `AI provider error: ${err.message}` });
  }

  // ── Parse file references from the answer ─────────────────────────────────
  // Extract [path/to/file.js] and [path/to/file.js:10-25] patterns
  const extractedReferences = extractReferences(answer);
  
  // Validate references against the actual repository files and bounds
  const references = [];
  for (const ref of extractedReferences) {
    const fileNode = record.analysis.files.find(f => f.filePath === ref.path);
    if (!fileNode) continue; // Drop hallucinated files

    if (ref.lines) {
      const parts = ref.lines.split('-');
      const start = parseInt(parts[0], 10);
      const end = parts.length > 1 ? parseInt(parts[1], 10) : start;
      
      // If line bounds are invalid, we can just strip the lines and keep the file reference
      if (isNaN(start) || start < 1 || start > fileNode.lineCount || (end && end > fileNode.lineCount)) {
        ref.lines = null;
      }
    }
    references.push(ref);
  }

  // ── Respond ────────────────────────────────────────────────────────────────
  return res.json({
    question,
    answer,
    references,
    context: {
      filesConsidered: context.files.length,
      totalSourceChars: context.totalSourceChars,
      truncated: context.truncated,
      files: context.files.map(f => ({
        path:   f.path,
        reason: f.reason,
        score:  f.score,
      })),
    },
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract file references from an AI answer.
 * Matches patterns: [src/foo.js] and [src/foo.js:10-25]
 *
 * @param {string} answer
 * @returns {Array<{path: string, lines: string|null}>}
 */
function extractReferences(answer) {
  const pattern = /\[([a-zA-Z0-9_.\-/]+(?::\d+(?:-\d+)?)?)\]/g;
  const found   = new Map();
  let match;

  while ((match = pattern.exec(answer)) !== null) {
    const raw   = match[1];
    const colon = raw.lastIndexOf(':');
    let filePath, lines;

    // Detect [path:10-25] vs [path.js] (colon must come after a dot to be a line ref)
    if (colon > 0 && /^\d/.test(raw.slice(colon + 1))) {
      filePath = raw.slice(0, colon);
      lines    = raw.slice(colon + 1);
    } else {
      filePath = raw;
      lines    = null;
    }

    if (!found.has(filePath)) {
      found.set(filePath, { path: filePath, lines });
    }
  }

  return Array.from(found.values());
}

module.exports = { ask };
