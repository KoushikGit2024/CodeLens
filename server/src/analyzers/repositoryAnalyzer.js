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
const { createFileAnalysis } = require('./symbols');

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
 * }
 */
async function analyzeRepository(rootDir) {
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

    const fileAnalysis = await analyzeFile(absPath, relPath, language);
    result.files.push(fileAnalysis);

    if (fileAnalysis.error && !fileAnalysis.symbols?.length) {
      result.errorFiles++;
    } else {
      result.analyzedFiles++;
    }

    result.languageSummary[language] = (result.languageSummary[language] ?? 0) + 1;
  }

  return result;
}

/**
 * Analyse a single file.  Never throws — always returns a FileAnalysis.
 *
 * @param {string} absPath   — absolute path to the file
 * @param {string} relPath   — relative path for the FileAnalysis record
 * @param {string} language  — detected language ID
 * @returns {Promise<FileAnalysis>}
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
