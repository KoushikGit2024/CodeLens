/**
 * repositoryAnalyzer.js
 *
 * Orchestrates the analysis of an entire repository.
 *
 * Responsibility:
 *   Given the root directory of an extracted repository, scan all source files,
 *   detect their language, parse each file using the appropriate parser, and
 *   return a structured RepositoryAnalysis object.
 *
 * Flow:
 *   repositoryRoot
 *   → scanSourceFiles()       — collect all supported source files
 *   → detectLanguage()        — determine parser per file
 *   → getParser()             — obtain configured tree-sitter parser
 *   → parser.parseFile()      — extract symbols from AST
 *   → RepositoryAnalysis      — aggregate results
 *
 * Fault isolation:
 *   Each file is analysed independently inside a try/catch.  A failure in
 *   one file creates a FileAnalysis with error=<message> and does NOT abort
 *   the remaining files.  Repository-level errors (e.g. cannot read directory)
 *   produce a RepositoryAnalysis with status='error'.
 *
 * Performance:
 *   web-tree-sitter initialisation and grammar loading are cached by
 *   parserRegistry (loaded once, reused for every file of that language).
 *   Files above MAX_FILE_BYTES are skipped rather than parsed.
 */

'use strict';

const path = require('path');
const fs   = require('fs');

const { detectLanguage }  = require('./languageDetector');
const { getParser }       = require('./parserRegistry');
const { JavaScriptParser } = require('./JavaScriptParser');
const { TypeScriptParser } = require('./TypeScriptParser');
const { PythonParser } = require('./PythonParser');
const { JavaParser } = require('./JavaParser');
const { CppParser } = require('./CppParser');
const { createFileAnalysis } = require('./symbols');
const { hashContent } = require('./fingerprint');

// ── Constants ─────────────────────────────────────────────────────────────────

// Directories that are never scanned (same list as the file-tree builder)
const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.svn', '__pycache__', '.DS_Store',
  'dist', 'build', 'coverage', '.next', '.nuxt', '.cache',
  'vendor', 'bower_components', '.turbo', '.parcel-cache',
]);

// Files larger than this are skipped to avoid OOM on minified bundles
const MAX_FILE_BYTES = 512 * 1024; // 512 KB

// ── Parser instantiation ──────────────────────────────────────────────────────

/**
 * Map language ID → function that creates the appropriate parser subclass.
 * Extend this map when adding new language support.
 *
 * @type {Object.<string, function(tsParser): BaseParser>}
 */
const PARSER_FACTORIES = {
  javascript: (tsParser) => new JavaScriptParser(tsParser),
  typescript: (tsParser) => new TypeScriptParser(tsParser),
  python:     (tsParser) => new PythonParser(tsParser),
  java:       (tsParser) => new JavaParser(tsParser),
  cpp:        (tsParser) => new CppParser(tsParser),
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Analyse an entire repository.
 *
 * @param {string} rootDir   — absolute path to the extracted repository root
 * @returns {Promise<RepositoryAnalysis>}
 *
 * RepositoryAnalysis shape:
 * {
 *   status:        'ready' | 'error'
 *   error?:        string
 *   rootDir:       string
 *   analyzedAt:    string (ISO)
 *   totalFiles:    number   — number of source files found
 *   analyzedFiles: number   — number successfully analysed (even with parse errors)
 *   skippedFiles:  number   — unsupported language or too large
 *   errorFiles:    number   — files where analysis threw an exception
 *   files:         FileAnalysis[]
 *   languageSummary: { [lang]: number }  — file count per language
 *   meta:          { analysisVersion, cacheHits, cacheMisses, addedFiles, modifiedFiles, deletedFiles, unchangedFiles }
 * }
 */
async function analyzeRepository(rootDir, previousAnalysis = null) {
  const result = {
    status:        'ready',
    error:         null,
    rootDir,
    analyzedAt:    new Date().toISOString(),
    totalFiles:    0,
    analyzedFiles: 0,
    skippedFiles:  0,
    errorFiles:    0,
    files:         [],
    languageSummary: {},
    meta: {
      analysisVersion: previousAnalysis ? previousAnalysis.meta.analysisVersion + 1 : 1,
      cacheHits: 0,
      cacheMisses: 0,
      addedFiles: 0,
      modifiedFiles: 0,
      deletedFiles: 0,
      unchangedFiles: 0
    }
  };

  let sourceFiles;
  try {
    sourceFiles = scanSourceFiles(rootDir);
  } catch (err) {
    result.status = 'error';
    result.error  = `Failed to scan repository: ${err.message}`;
    return result;
  }

  result.totalFiles = sourceFiles.length;

  for (const absPath of sourceFiles) {
    const relPath  = path.relative(rootDir, absPath).replace(/\\/g, '/');
    const language = detectLanguage(absPath);

    if (!language || !PARSER_FACTORIES[language]) {
      result.skippedFiles++;
      continue;
    }

    // Skip files that are too large
    let stat;
    try { stat = fs.statSync(absPath); } catch { result.skippedFiles++; continue; }
    if (stat.size > MAX_FILE_BYTES) {
      result.skippedFiles++;
      result.files.push(createFileAnalysis({
        filePath: relPath,
        language,
        error: `File skipped: size ${stat.size} bytes exceeds limit of ${MAX_FILE_BYTES} bytes`,
      }));
      continue;
    }

    // ── Incremental Hash Check ──────────────────────────────────────────────
    let content;
    try {
      content = fs.readFileSync(absPath, 'utf8');
    } catch (err) {
      result.errorFiles++;
      result.files.push(createFileAnalysis({
        filePath: relPath,
        language,
        error: `Cannot read file: ${err.message}`,
      }));
      continue;
    }

    const hash = hashContent(content);
    let cachedAnalysis = null;

    if (previousAnalysis && previousAnalysis.files) {
      cachedAnalysis = previousAnalysis.files.find(f => f.filePath === relPath);
    }

    if (cachedAnalysis && cachedAnalysis.hash === hash && cachedAnalysis.language === language) {
      // Cache HIT! Reuse previous analysis exactly as is.
      result.files.push(cachedAnalysis);
      
      result.meta.cacheHits++;
      result.meta.unchangedFiles++;
      
      if (cachedAnalysis.error && !cachedAnalysis.symbols?.length) {
        result.errorFiles++;
      } else {
        result.analyzedFiles++;
      }
      result.languageSummary[language] = (result.languageSummary[language] ?? 0) + 1;
      continue;
    }

    // Cache MISS! Reparse the file
    result.meta.cacheMisses++;
    if (cachedAnalysis) {
      result.meta.modifiedFiles++;
    } else {
      result.meta.addedFiles++;
    }

    const fileAnalysis = await analyzeFileContent(content, relPath, language);
    fileAnalysis.hash = hash; // Tag with hash for future incremental runs
    
    result.files.push(fileAnalysis);

    if (fileAnalysis.error && !fileAnalysis.symbols?.length) {
      result.errorFiles++;
    } else {
      result.analyzedFiles++;
    }

    result.languageSummary[language] = (result.languageSummary[language] ?? 0) + 1;
  }

  // Detect deleted files
  if (previousAnalysis && previousAnalysis.files) {
    for (const oldFile of previousAnalysis.files) {
      if (!result.files.some(f => f.filePath === oldFile.filePath)) {
        result.meta.deletedFiles++;
      }
    }
  }

  return result;
}

/**
 * Analyse a single file's content directly. Never throws — always returns a FileAnalysis.
 *
 * @param {string} source    — file content
 * @param {string} relPath   — relative path for the FileAnalysis record
 * @param {string} language  — detected language ID
 * @returns {Promise<FileAnalysis>}
 */
async function analyzeFileContent(source, relPath, language) {
  let tsParser;
  try {
    tsParser = await getParser(language);
  } catch (err) {
    return createFileAnalysis({
      filePath: relPath,
      language,
      error: `Parser unavailable: ${err.message}`,
    });
  }

  const factory = PARSER_FACTORIES[language];
  const parser  = factory(tsParser);

  return parser.parseFile(source, relPath);
}

/**
 * Legacy wrapper for analyzeFile
 */
async function analyzeFile(absPath, relPath, language) {
  let source;
  try {
    source = fs.readFileSync(absPath, 'utf8');
  } catch (err) {
    return createFileAnalysis({
      filePath: relPath,
      language,
      error: `Cannot read file: ${err.message}`,
    });
  }
  return analyzeFileContent(source, relPath, language);
}

// ── File scanner ──────────────────────────────────────────────────────────────

/**
 * Recursively collect all source files from a directory.
 * Ignores non-source files and IGNORED_DIRS automatically.
 *
 * @param {string} dir   — absolute directory path
 * @returns {string[]}   — absolute paths of source files
 */
function scanSourceFiles(dir) {
  const results = [];
  _scanDir(dir, results);
  return results;
}

function _scanDir(dir, results) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // unreadable directory — skip silently
  }

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;

    const absPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      _scanDir(absPath, results);
    } else if (entry.isFile() && detectLanguage(entry.name) !== null) {
      results.push(absPath);
    }
  }
}

module.exports = { analyzeRepository, analyzeFile, scanSourceFiles };
