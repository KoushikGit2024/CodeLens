import { detectLanguage } from '../parsing/language.detector.js';
import { getParser } from '../parsing/parser.registry.js';
import { JavaScriptParser } from '../parsing/languages/javascript.parser.js';
import { TypeScriptParser } from '../parsing/languages/typescript.parser.js';
import { PythonParser } from '../parsing/languages/python.parser.js';
import { JavaParser } from '../parsing/languages/java.parser.js';
import { CppParser } from '../parsing/languages/cpp.parser.js';
import { KotlinParser } from '../parsing/languages/kotlin.parser.js';
import { createFileAnalysis } from '../parsing/symbols.js';
import { hashContent } from './fingerprint.js';
import { loadAllFiles } from './persistence.store.js';

const PARSER_FACTORIES = {
  javascript: (tsParser) => new JavaScriptParser(tsParser),
  typescript: (tsParser) => new TypeScriptParser(tsParser),
  tsx:        (tsParser) => new TypeScriptParser(tsParser),
  python:     (tsParser) => new PythonParser(tsParser),
  java:       (tsParser) => new JavaParser(tsParser),
  cpp:        (tsParser) => new CppParser(tsParser),
  kotlin:     (tsParser) => new KotlinParser(tsParser),
};

export async function analyzeRepository(repoId, previousAnalysis = null, onProgress = null, options = {}) {
  if (onProgress) onProgress('scanning_files');
  
  let sourceFiles;
  try {
    sourceFiles = await loadAllFiles(repoId);
  } catch (err) {
    return { status: 'error', error: `Failed to load files from storage: ${err.message}` };
  }

  const result = {
    status:        'ready',
    error:         null,
    repoId,
    analyzedAt:    new Date().toISOString(),
    totalFiles:    sourceFiles.length,
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

  if (onProgress) onProgress('analyzing_ast', { total: sourceFiles.length, current: 0 });

  let currentIndex = 0;
  for (const fileRecord of sourceFiles) {
    currentIndex++;
    
    // Yield the event loop to allow UI to update
    await new Promise(resolve => setTimeout(resolve, 0));
    
    if (onProgress) {
      onProgress('analyzing_ast', { total: sourceFiles.length, current: currentIndex });
    }
    
    const relPath  = fileRecord.filePath;
    const content = fileRecord.content;
    const language = detectLanguage(relPath);

    if (!language || !PARSER_FACTORIES[language]) {
      result.skippedFiles++;
      continue;
    }

    // ── Incremental Hash Check ──────────────────────────────────────────────
    const hash = await hashContent(content);
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

  if (onProgress) onProgress('finalizing_analysis');

  return result;
}

export async function analyzeFileContent(source, relPath, language) {
  const lineCount = source.split(/\r\n|\n/).length;

  let tsParser;
  try {
    tsParser = await getParser(language);
  } catch (err) {
    return createFileAnalysis({
      filePath: relPath,
      language,
      lineCount,
      error: `Parser unavailable: ${err.message}`,
    });
  }

  const factory = PARSER_FACTORIES[language];
  const parser  = factory(tsParser);

  const fileAnalysis = await parser.parseFile(source, relPath);
  fileAnalysis.lineCount = lineCount;
  return fileAnalysis;
}
