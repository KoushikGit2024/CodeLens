/**
 * base.context.js
 *
 * It initiates the grounding pipeline, then extracts deterministic code segments,
 * and then it applies hard token limits to structure a safe prompt for the LLM.
 */

import { buildDependencyGraph, getFileDependencies } from '../dependencies/dependency.analyzer.js';

export const DEFAULTS = {
  maxFiles: 8,
  maxSourceChars: 24_000,
  maxSymbolsPerFile: 20,
  snippetLines: 40,
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * It orchestrates file scoring, then extracts context snippets via the loader callback,
 * and then it applies length truncations to build the final AiContext object.
 */
export async function buildContext(analysis, question, fileLoaderCallback, opts = {}) {
  const activeContext = opts.activeContext || null;
  const cfg = { ...DEFAULTS, ...opts };

  const graph = buildDependencyGraph(analysis);

  const terms = extractQueryTerms(question);
  const scored = scoreFiles(analysis, graph, terms, activeContext);

  expandWithDeps(scored, graph, cfg.maxFiles);

  const selected = Array.from(scored.entries())
    .filter(([, s]) => s.score > 0)
    .sort(([pathA, sA], [pathB, sB]) => {
      if (sB.score !== sA.score) return sB.score - sA.score;
      return pathA.localeCompare(pathB);
    })
    .slice(0, cfg.maxFiles)
    .map(([filePath, s]) => ({ filePath, ...s }));

  const useFallback = selected.length === 0 && analysis?.files?.length > 0;
  const candidates = useFallback
    ? analysis.files.slice(0, cfg.maxFiles).map(f => ({
        filePath: f.filePath,
        score: 0,
        reason: 'fallback: no specific match found',
        symbols: extractSymbolNames(f),
      }))
    : selected;

  let totalChars = 0;
  let truncated = false;
  const files = [];

  for (const candidate of candidates) {
    const fileAnalysis = analysis.files.find(f => f.filePath === candidate.filePath);
    const depInfo = getFileDependencies(graph, candidate.filePath);

    const isContextFile = activeContext && candidate.filePath === activeContext.filePath;
    const startLine = isContextFile && activeContext.startLine ? Math.max(1, activeContext.startLine - 10) : null;
    const endLine = isContextFile && activeContext.endLine ? activeContext.endLine + 10 : null;

    const candidateItem = { path: candidate.filePath };
    const charsRead = await loadSourceSnippet(
      candidateItem,
      fileLoaderCallback,
      terms,
      fileAnalysis,
      cfg,
      startLine,
      endLine
    );

    if (totalChars + charsRead > cfg.maxSourceChars && !isContextFile) {
      candidateItem.source = null;
      truncated = true;
    } else {
      totalChars += charsRead;
    }

    files.push({
      path: candidate.filePath,
      reason: candidate.reason,
      score: candidate.score,
      symbols: (candidate.symbols || []).slice(0, cfg.maxSymbolsPerFile),
      dependencies: depInfo.dependencies.filter(d => d.filePath).map(d => d.filePath),
      dependents: depInfo.dependents.map(d => d.filePath),
      source: candidateItem.source || null,
      language: fileAnalysis.language,
    });
  }

  return {
    question,
    repository: {
      name: analysis.name || 'unknown',
      totalFiles: analysis.analyzedFiles || analysis.files?.length || 0,
      languages: analysis.languageSummary || {},
    },
    files,
    totalSourceChars: totalChars,
    truncated,
  };
}

// ── Relevance scoring ─────────────────────────────────────────────────────────

/**
 * It splits the text query, then extracts meaningful keywords,
 * and then it applies a strict stop-word filter to return unique targets.
 */
export function extractQueryTerms(question) {
  const STOP_WORDS = new Set([
    'a',
    'an',
    'the',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'shall',
    'should',
    'may',
    'might',
    'must',
    'can',
    'could',
    'to',
    'of',
    'in',
    'on',
    'at',
    'by',
    'for',
    'with',
    'about',
    'into',
    'from',
    'and',
    'or',
    'but',
    'not',
    'how',
    'what',
    'where',
    'when',
    'which',
    'who',
    'does',
    'this',
    'that',
    'it',
    'its',
    'file',
    'files',
    'code',
    'function',
    'functions',
    'method',
    'methods',
    'class',
    'classes',
    'work',
    'works',
    'use',
    'used',
    'using',
  ]);

  const raw = question
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, ' ')
    .split(/\s+/);
  const unique = new Set(raw.filter(t => t.length >= 2 && !STOP_WORDS.has(t)));
  return Array.from(unique);
}

/**
 * It evaluates each file AST against the query terms, then extracts substring matches,
 * and then it applies numeric scoring points for structural relevance.
 */
function scoreFiles(analysis, graph, terms, activeContext = null) {
  const scored = new Map();
  if (!analysis?.files) return scored;

  for (const fileAnalysis of analysis.files) {
    const fp = fileAnalysis.filePath;
    let score = 0;
    const reasons = [];

    if (activeContext && activeContext.filePath === fp) {
      score += 100;
      reasons.push('active file');
    }

    const basename = fp.split('/').pop();
    const stemRaw = basename.replace(/\.[^.]+$/, '');
    const stem = stemRaw.toLowerCase();
    const fpLower = fp.toLowerCase();
    const stemParts = stemRaw
      .split(/(?=[A-Z])|[-_]/)
      .map(p => p.toLowerCase())
      .filter(p => p.length >= 3);
    const symbols = extractSymbolNames(fileAnalysis);
    const symLower = symbols.map(s => s.toLowerCase());
    const imports = extractImportSources(fileAnalysis);

    for (const term of terms) {
      const filenameMatch =
        stem.includes(term) ||
        term.includes(stem) ||
        fpLower.includes(term) ||
        stemParts.some(p => p.length >= 3 && term.includes(p));
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
        reason: reasons.length > 0 ? reasons.slice(0, 3).join('; ') : 'general match',
        symbols,
      });
    } else {
      scored.set(fp, { score: 0, reason: '', symbols });
    }
  }

  return scored;
}

/**
 * It queries the dependency graph, then extracts neighboring modules,
 * and then it applies a secondary relevance boost based on coupling.
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
        existing.score += 1;
        existing.reason = `dependency of ${fp.split('/').pop()}`;
      }
    }

    for (const dep of depInfo.dependents) {
      const existing = scored.get(dep.filePath);
      if (existing && existing.score === 0) {
        existing.score += 1;
        existing.reason = `dependent of ${fp.split('/').pop()}`;
      }
    }
  }
}

// ── Source loading ────────────────────────────────────────────────────────────

/**
 * It triggers the frontend loader callback, then extracts specific lines matching AST targets,
 * and then it applies string truncation to return a clean snippet.
 */
async function loadSourceSnippet(item, fileLoaderCallback, terms, fileAnalysis, cfg, startLine = null, endLine = null) {
  try {
    const sourceStr = await fileLoaderCallback(item.path);
    if (!sourceStr) {
      item.source = null;
      return 0;
    }
    const lines = sourceStr.split(/\r?\n/);

    if (startLine !== null && endLine !== null) {
      const idxStart = Math.max(0, startLine - 1);
      const idxEnd = Math.min(lines.length, endLine);
      item.source = lines.slice(idxStart, idxEnd).join('\n');
      return item.source.length;
    }

    if (lines.length <= cfg.snippetLines * 2) {
      item.source = sourceStr;
      return sourceStr.length;
    }

    if (fileAnalysis && fileAnalysis.symbols && terms.length > 0) {
      const termsLower = terms.map(t => t.toLowerCase());
      const match = fileAnalysis.symbols.find(
        sym => sym.name && termsLower.some(t => sym.name.toLowerCase().includes(t))
      );

      if (match && match.location) {
        const start = Math.max(0, match.location.startLine - 1);
        const end = Math.min(lines.length, start + cfg.snippetLines);
        item.source = lines.slice(start, end).join('\n');
        return item.source.length;
      }
    }

    item.source = lines.slice(0, cfg.snippetLines).join('\n');
    return item.source.length;
  } catch (err) {
    console.warn(`[baseContext] Failed to read ${item.path}: ${err.message}`);
    item.source = null;
    return 0;
  }
}

// ── Symbol helpers ────────────────────────────────────────────────────────────

/**
 * It filters the symbol structures, then extracts the display identifiers,
 * and then it applies them into a flattened string array.
 */
export function extractSymbolNames(fileAnalysis) {
  if (!fileAnalysis || !fileAnalysis.symbols) return [];
  return fileAnalysis.symbols.filter(s => s.kind !== 'import' && s.kind !== 'export' && s.name).map(s => s.name);
}

/**
 * It identifies AST import nodes, then extracts the literal source strings,
 * and then it applies them into a string array.
 */
function extractImportSources(fileAnalysis) {
  if (!fileAnalysis || !fileAnalysis.symbols) return [];
  return fileAnalysis.symbols.filter(s => s.kind === 'import' && s.source).map(s => s.source);
}

// ── Prompt assembly ───────────────────────────────────────────────────────────

/**
 * It gathers the formatted repository metrics, then extracts the fetched source fragments,
 * and then it applies rigid guardrails to build the final LLM instructions.
 */
export function buildPrompt(context) {
  const lines = [];

  lines.push('You are CodeLens, a code intelligence assistant.');
  lines.push("Answer the developer's question using ONLY the repository context provided below.");
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
