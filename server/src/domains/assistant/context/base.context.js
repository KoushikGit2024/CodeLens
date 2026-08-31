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

const { buildDependencyGraph, getFileDependencies } = require('../../dependencies/dependency.analyzer');

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
 * @param {object}  [opts]       — override default limits (and pass activeContext)
 * @returns {AiContext}
 */
function buildContext(analysis, question, extractPath, opts = {}) {
  const activeContext = opts.activeContext || null;
  const cfg = { ...DEFAULTS, ...opts };

  // Build graph (needed for dependency expansion)
  const graph = buildDependencyGraph(analysis);

  // 1. Score every file
  const terms   = extractQueryTerms(question);
  const scored  = scoreFiles(analysis, graph, terms, activeContext);

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

  // 4. Load source from disk for top files
  let totalChars = 0;
  let truncated  = false;
  const files    = [];

  for (const candidate of candidates) {
    const fileAnalysis = analysis.files.find(f => f.filePath === candidate.filePath);
    const depInfo      = getFileDependencies(graph, candidate.filePath);

    // Identify active context constraints
    const isContextFile = activeContext && candidate.filePath === activeContext.filePath;
    const startLine = isContextFile && activeContext.startLine ? Math.max(1, activeContext.startLine - 10) : null;
    const endLine = isContextFile && activeContext.endLine ? activeContext.endLine + 10 : null;
    
    // Read source
    const candidateItem = { path: candidate.filePath };
    const charsRead = loadSourceSnippet(candidateItem, extractPath, terms, fileAnalysis, cfg, startLine, endLine);
    
    if (totalChars + charsRead > cfg.maxSourceChars && !isContextFile) {
        candidateItem.source = null;
        truncated = true;
    } else {
        totalChars += charsRead;
    }

    files.push({
      path:         candidate.filePath,
      reason:       candidate.reason,
      score:        candidate.score,
      symbols:      (candidate.symbols || []).slice(0, cfg.maxSymbolsPerFile),
      dependencies: depInfo.dependencies
        .filter(d => d.filePath)
        .map(d => d.filePath),
      dependents:   depInfo.dependents.map(d => d.filePath),
      source:       candidateItem.source || null,
      language:     fileAnalysis.language,
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
 * @param {object}   [activeContext]
 * @returns {Map<string, {score, reason, symbols}>}
 */
function scoreFiles(analysis, graph, terms, activeContext = null) {
  const scored = new Map();

  for (const fileAnalysis of analysis.files) {
    const fp        = fileAnalysis.filePath;
    let score = 0;
    const reasons = [];

    // ── Active Context Boost ──────────────────────────────────────────────────
    if (activeContext && activeContext.filePath === fp) {
      score += 100;
      reasons.push('active file');
    }

    const basename  = path.posix.basename(fp);
    const stemRaw   = basename.replace(/\.[^.]+$/, '');
    const stem      = stemRaw.toLowerCase();
    const fpLower   = fp.toLowerCase();
    const stemParts = stemRaw.split(/(?=[A-Z])|[-_]/).map(p => p.toLowerCase()).filter(p => p.length >= 3);
    const symbols   = extractSymbolNames(fileAnalysis);
    const symLower  = symbols.map(s => s.toLowerCase());
    const imports   = extractImportSources(fileAnalysis);

    for (const term of terms) {
      const filenameMatch = stem.includes(term)
        || term.includes(stem)
        || fpLower.includes(term)
        || stemParts.some(p => p.length >= 3 && term.includes(p));
      if (filenameMatch) {
        score += 3;
        reasons.push(`filename matches "${term}"`);
      }

      if (symLower.some(s => s.includes(term) || term.includes(s))) {
        score += 2;
        reasons.push(`symbol matches "${term}"`);
      }

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
 * @param {object}      item
 * @param {string}      extractPath
 * @param {string[]}    terms
 * @param {object|null} fileAnalysis
 * @param {object}      cfg
 * @param {number|null} startLine
 * @param {number|null} endLine
 * @returns {number} chars read
 */
function loadSourceSnippet(item, extractPath, terms, fileAnalysis, cfg, startLine = null, endLine = null) {
  const absPath = path.join(extractPath, item.path);
  if (!fs.existsSync(absPath)) {
    item.source = null;
    return 0;
  }

  try {
    const sourceStr = fs.readFileSync(absPath, 'utf8');
    const lines = sourceStr.split(/\r?\n/);

    // If explicit line range is requested (via active context)
    if (startLine !== null && endLine !== null) {
      const idxStart = Math.max(0, startLine - 1);
      const idxEnd = Math.min(lines.length, endLine);
      item.source = lines.slice(idxStart, idxEnd).join('\n');
      return item.source.length;
    }

    // Small file? include whole thing
    if (lines.length <= cfg.snippetLines * 2) {
      item.source = sourceStr;
      return sourceStr.length;
    }

    // Try to find a relevant symbol and extract lines around it
    if (fileAnalysis && fileAnalysis.symbols && terms.length > 0) {
      const termsLower = terms.map(t => t.toLowerCase());
      const match = fileAnalysis.symbols.find(sym =>
        sym.name && termsLower.some(t => sym.name.toLowerCase().includes(t))
      );

      if (match && match.location) {
        const start = Math.max(0, match.location.startLine - 1);
        const end = Math.min(lines.length, start + cfg.snippetLines);
        item.source = lines.slice(start, end).join('\n');
        return item.source.length;
      }
    }

    // Fall back to beginning of file
    item.source = lines.slice(0, cfg.snippetLines).join('\n');
    return item.source.length;
  } catch (err) {
    console.warn(`[baseContext] Failed to read ${absPath}: ${err.message}`);
    item.source = null;
    return 0;
  }
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
      lines.push(`--- FILE: ${f.path} (Language: ${f.language || 'unknown'}) ---`);
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
