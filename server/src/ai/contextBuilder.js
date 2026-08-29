/**
 * contextBuilder.js
 *
 * Builds a structured, grounded context object for the AI Q&A layer.
 *
 * ── Architecture ──────────────────────────────────────────────────────────────
 *
 *   Question
 *      ↓
 *   buildContext(analysis, graph, question, extractPath, opts?)
 *      ├── 1. scoreFiles()         — deterministic relevance scoring
 *      ├── 2. expandWithDeps()     — add dependency/dependent files
 *      ├── 3. loadSourceSnippets() — read file content from disk
 *      └── 4. assembleContext()    — build the structured AiContext object
 *      ↓
 *   AiContext
 *
 * ── Relevance scoring ─────────────────────────────────────────────────────────
 *
 *   Each file in the repository receives a score (higher = more relevant):
 *
 *   +3  path/filename contains a query term (case-insensitive)
 *   +2  a symbol name in the file matches a query term
 *   +1  the file imports a package whose name matches a query term
 *   +1  the file is a dependency of a file that scored > 0
 *   +1  the file is a dependent of a file that scored > 0
 *
 *   Files with score 0 are excluded from context unless the repository is small.
 *
 * ── Context limits ────────────────────────────────────────────────────────────
 *
 *   MAX_FILES            — max number of files included in context    (default: 8)
 *   MAX_SOURCE_CHARS     — max total source characters included        (default: 24 000)
 *   MAX_SYMBOLS_PER_FILE — max symbols reported per file               (default: 20)
 *   SNIPPET_LINES        — lines to include around a relevant symbol   (default: 40)
 *
 * ── AiContext schema ──────────────────────────────────────────────────────────
 *
 * {
 *   question:   string
 *   repository: { name: string, totalFiles: number, languages: object }
 *   files: [
 *     {
 *       path:         string          — relative file path
 *       reason:       string          — human-readable reason for inclusion
 *       score:        number          — relevance score
 *       symbols:      string[]        — names of extracted symbols (functions, classes, …)
 *       dependencies: string[]        — files this file imports (internal only)
 *       dependents:   string[]        — files that import this file (internal only)
 *       source:       string | null   — source snippet or full content
 *     }
 *   ]
 *   totalSourceChars:  number
 *   truncated:         boolean         — true if context was cut due to size limit
 * }
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const { buildDependencyGraph, getFileDependencies } = require('../analyzers/dependencyGraph');

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULTS = {
  maxFiles:          8,
  maxSourceChars:    24_000,
  maxSymbolsPerFile: 20,
  snippetLines:      40,
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build an AiContext for the given question and repository analysis.
 *
 * @param {object}  analysis     — RepositoryAnalysis from repositoryAnalyzer
 * @param {string}  question     — the user's natural-language question
 * @param {string}  extractPath  — absolute path to the extracted repository root
 *                                 (used to read source from disk)
 * @param {object}  [opts]       — override default limits
 * @returns {AiContext}
 */
function buildContext(analysis, question, extractPath, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };

  // Build graph (needed for dependency expansion)
  const graph = buildDependencyGraph(analysis);

  // 1. Score every file
  const terms   = extractQueryTerms(question);
  const scored  = scoreFiles(analysis, graph, terms);

  // 2. Expand with direct dependencies of top-ranked files
  expandWithDeps(scored, graph, cfg.maxFiles);

  // 3. Select top N by score, then alphabetically for ties
  const selected = Array.from(scored.entries())
    .filter(([, s]) => s.score > 0)
    .sort(([pathA, sA], [pathB, sB]) => {
      if (sB.score !== sA.score) return sB.score - sA.score;
      return pathA.localeCompare(pathB);
    })
    .slice(0, cfg.maxFiles)
    .map(([filePath, s]) => ({ filePath, ...s }));

  // If nothing scored, fall back to first N files (small repo heuristic)
  const useFallback = selected.length === 0 && analysis.files.length > 0;
  const candidates = useFallback
    ? analysis.files.slice(0, cfg.maxFiles).map(f => ({
        filePath: f.filePath,
        score: 0,
        reason: 'fallback: no specific match found',
        symbols: extractSymbolNames(f),
      }))
    : selected;

  // 3. Load source for each candidate
  let totalChars = 0;
  let truncated  = false;
  const files    = [];

  for (const candidate of candidates) {
    if (totalChars >= cfg.maxSourceChars) {
      truncated = true;
      break;
    }

    const fileAnalysis = analysis.files.find(f => f.filePath === candidate.filePath);
    const depInfo      = getFileDependencies(graph, candidate.filePath);

    // Read source snippet
    const remaining = cfg.maxSourceChars - totalChars;
    const source    = loadSourceSnippet(
      extractPath,
      candidate.filePath,
      fileAnalysis,
      terms,
      cfg.snippetLines,
      remaining
    );

    totalChars += source ? source.length : 0;

    files.push({
      path:         candidate.filePath,
      reason:       candidate.reason,
      score:        candidate.score,
      symbols:      (candidate.symbols || []).slice(0, cfg.maxSymbolsPerFile),
      dependencies: depInfo.dependencies
        .filter(d => d.filePath)
        .map(d => d.filePath),
      dependents:   depInfo.dependents.map(d => d.filePath),
      source:       source || null,
    });
  }

  return {
    question,
    repository: {
      name:       analysis.name || 'unknown',
      totalFiles: analysis.analyzedFiles || analysis.files.length,
      languages:  analysis.languageSummary || {},
    },
    files,
    totalSourceChars: totalChars,
    truncated,
  };
}

// ── Relevance scoring ─────────────────────────────────────────────────────────

/**
 * Tokenise a question into lowercase terms, removing stop words and
 * punctuation.  Returns an array of unique lowercase terms.
 *
 * @param {string} question
 * @returns {string[]}
 */
function extractQueryTerms(question) {
  const STOP_WORDS = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall',
    'should', 'may', 'might', 'must', 'can', 'could', 'to', 'of', 'in',
    'on', 'at', 'by', 'for', 'with', 'about', 'into', 'from', 'and', 'or',
    'but', 'not', 'how', 'what', 'where', 'when', 'which', 'who', 'does',
    'this', 'that', 'it', 'its', 'file', 'files', 'code', 'function',
    'functions', 'method', 'methods', 'class', 'classes', 'work', 'works',
    'use', 'used', 'using',
  ]);

  const raw = question.toLowerCase().replace(/[^a-z0-9_]/g, ' ').split(/\s+/);
  const unique = new Set(raw.filter(t => t.length >= 2 && !STOP_WORDS.has(t)));
  return Array.from(unique);
}

/**
 * Score all files in the analysis based on relevance to the query terms.
 *
 * @param {object}   analysis
 * @param {object}   graph     — DependencyGraph
 * @param {string[]} terms     — query terms
 * @returns {Map<string, {score, reason, symbols}>}
 */
function scoreFiles(analysis, graph, terms) {
  const scored = new Map();

  for (const fileAnalysis of analysis.files) {
    const fp        = fileAnalysis.filePath;
    const basename  = path.posix.basename(fp);
    // Remove extension for matching, e.g. 'authController' from 'authController.js'
    const stemRaw   = basename.replace(/\.[^.]+$/, '');
    const stem      = stemRaw.toLowerCase();
    const fpLower   = fp.toLowerCase();
    // Split stem into word parts using original (pre-lowercase) name for camelCase detection
    // authController → ['auth', 'Controller'] → ['auth', 'controller']
    const stemParts = stemRaw.split(/(?=[A-Z])|[-_]/).map(p => p.toLowerCase()).filter(p => p.length >= 3);
    const symbols   = extractSymbolNames(fileAnalysis);
    const symLower  = symbols.map(s => s.toLowerCase());
    const imports   = extractImportSources(fileAnalysis);

    let score = 0;
    const reasons = [];

    for (const term of terms) {
      // +3 path/filename match:
      //   - stem/path contains the term, OR
      //   - term contains the stem, OR
      //   - any stem word-part appears in the term
      const filenameMatch = stem.includes(term)
        || term.includes(stem)
        || fpLower.includes(term)
        || stemParts.some(p => p.length >= 3 && term.includes(p));
      if (filenameMatch) {
        score += 3;
        reasons.push(`filename matches "${term}"`);
      }

      // +2 symbol name match — direct or partial
      if (symLower.some(s => s.includes(term) || term.includes(s))) {
        score += 2;
        reasons.push(`symbol matches "${term}"`);
      }

      // +1 import source match (e.g. file imports 'express' and question is about express)
      if (imports.some(src => src.toLowerCase().includes(term))) {
        score += 1;
        reasons.push(`imports "${term}"`);
      }
    }

    if (score > 0 || terms.length === 0) {
      scored.set(fp, {
        score,
        reason:  reasons.length > 0 ? reasons.slice(0, 3).join('; ') : 'general match',
        symbols,
      });
    } else {
      // Store with score 0 so dep expansion can reference it
      scored.set(fp, { score: 0, reason: '', symbols });
    }
  }

  return scored;
}

/**
 * Boost scores of files that are direct dependencies or dependents of
 * already-scored files (score > 0), up to maxFiles total.
 *
 * @param {Map}    scored
 * @param {object} graph
 * @param {number} maxFiles
 */
function expandWithDeps(scored, graph, maxFiles) {
  // Collect files that scored > 0
  const seeded = Array.from(scored.entries())
    .filter(([, s]) => s.score > 0)
    .map(([fp]) => fp);

  for (const fp of seeded) {
    const depInfo = getFileDependencies(graph, fp);

    for (const dep of depInfo.dependencies) {
      if (!dep.filePath) continue;
      const existing = scored.get(dep.filePath);
      if (existing && existing.score === 0) {
        existing.score  += 1;
        existing.reason  = `dependency of ${path.posix.basename(fp)}`;
      }
    }

    for (const dep of depInfo.dependents) {
      const existing = scored.get(dep.filePath);
      if (existing && existing.score === 0) {
        existing.score  += 1;
        existing.reason  = `dependent of ${path.posix.basename(fp)}`;
      }
    }
  }
}

// ── Source loading ────────────────────────────────────────────────────────────

/**
 * Load a source snippet for a file.
 *
 * Strategy:
 *   1. If any symbol location matches a query term, extract SNIPPET_LINES
 *      around that symbol's start line.
 *   2. Otherwise return the full file content (up to remaining budget).
 *
 * @param {string}      extractPath
 * @param {string}      relPath
 * @param {object|null} fileAnalysis
 * @param {string[]}    terms
 * @param {number}      snippetLines
 * @param {number}      budget         — max characters to return
 * @returns {string|null}
 */
function loadSourceSnippet(extractPath, relPath, fileAnalysis, terms, snippetLines, budget) {
  if (!extractPath || !relPath) return null;

  const absPath = path.join(extractPath, relPath);
  let raw;
  try {
    raw = fs.readFileSync(absPath, 'utf8');
  } catch {
    return null;
  }

  if (!raw) return null;

  // Try to find a relevant symbol and extract lines around it
  if (fileAnalysis && fileAnalysis.symbols && terms.length > 0) {
    const termsLower = terms.map(t => t.toLowerCase());
    // Find the first symbol whose name matches a term
    const match = fileAnalysis.symbols.find(sym =>
      sym.name && termsLower.some(t => sym.name.toLowerCase().includes(t))
    );

    if (match && match.location) {
      const lines  = raw.split('\n');
      const start  = Math.max(0, match.location.startLine - 1);          // 0-based
      const end    = Math.min(lines.length, start + snippetLines);
      const snippet = lines.slice(start, end).join('\n');
      return snippet.slice(0, budget);
    }
  }

  // Fall back to beginning of file
  return raw.slice(0, budget);
}

// ── Symbol helpers ────────────────────────────────────────────────────────────

/**
 * Extract display names of all non-import/non-export symbols from a FileAnalysis.
 *
 * @param {object} fileAnalysis
 * @returns {string[]}
 */
function extractSymbolNames(fileAnalysis) {
  if (!fileAnalysis || !fileAnalysis.symbols) return [];
  return fileAnalysis.symbols
    .filter(s => s.kind !== 'import' && s.kind !== 'export' && s.name)
    .map(s => s.name);
}

/**
 * Extract all import source strings from a FileAnalysis.
 *
 * @param {object} fileAnalysis
 * @returns {string[]}
 */
function extractImportSources(fileAnalysis) {
  if (!fileAnalysis || !fileAnalysis.symbols) return [];
  return fileAnalysis.symbols
    .filter(s => s.kind === 'import' && s.source)
    .map(s => s.source);
}

// ── Prompt assembly ───────────────────────────────────────────────────────────

/**
 * Assemble the final text prompt to send to the AI model.
 *
 * The prompt:
 *   - Grounds the model in the supplied repository context
 *   - Explicitly prohibits fabricating files/functions/dependencies
 *   - Requests file references in the response
 *   - Instructs the model to acknowledge insufficient context
 *
 * @param {AiContext} context
 * @returns {string}
 */
function buildPrompt(context) {
  const lines = [];

  lines.push('You are CodeLens, a code intelligence assistant.');
  lines.push('Answer the developer\'s question using ONLY the repository context provided below.');
  lines.push('Rules:');
  lines.push('- Do not invent files, functions, classes, or dependencies that are not shown.');
  lines.push('- If the provided context is insufficient to answer fully, say so explicitly.');
  lines.push('- Reference relevant files using the format [path/to/file.js].');
  lines.push('- If you know the relevant line range, use [path/to/file.js:10-25].');
  lines.push('- Prefer precise technical explanations over vague summaries.');
  lines.push('- Distinguish what is shown in the code from what you are inferring.');
  lines.push('');
  lines.push(`Repository: ${context.repository.name}`);
  lines.push(`Total analysed files: ${context.repository.totalFiles}`);
  const langList = Object.entries(context.repository.languages)
    .map(([l, n]) => `${n} ${l}`)
    .join(', ');
  if (langList) lines.push(`Languages: ${langList}`);
  lines.push('');

  if (context.files.length === 0) {
    lines.push('No relevant source files were found for this question.');
  } else {
    lines.push(`Context includes ${context.files.length} relevant file(s):`);
    lines.push('');

    for (const f of context.files) {
      lines.push(`--- FILE: ${f.path} ---`);
      lines.push(`Reason included: ${f.reason}`);
      if (f.symbols.length > 0) {
        lines.push(`Symbols: ${f.symbols.join(', ')}`);
      }
      if (f.dependencies.length > 0) {
        lines.push(`Imports: ${f.dependencies.join(', ')}`);
      }
      if (f.source) {
        lines.push('Source:');
        lines.push('```');
        lines.push(f.source);
        lines.push('```');
      }
      lines.push('');
    }
  }

  if (context.truncated) {
    lines.push('[Note: context was truncated due to size limits. Some files may not be shown.]');
    lines.push('');
  }

  lines.push(`Question: ${context.question}`);
  lines.push('');
  lines.push('Answer:');

  return lines.join('\n');
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  buildContext,
  buildPrompt,
  extractQueryTerms,   // exported for testing
  extractSymbolNames,  // exported for testing
  DEFAULTS,
};
