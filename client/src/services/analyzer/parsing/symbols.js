/**
 * symbols.js
 *
 * Canonical internal data model for all symbols and static analysis findings 
 * extracted from source files.
 *
 * This module contains only factory functions and constants — no parsing
 * logic. It is the single source of truth for what every symbol, finding, 
 * graph node, and repository payload looks like in memory.
 */

// ── Symbol type constants ─────────────────────────────────────────────────────

export const SymbolKind = Object.freeze({
  FUNCTION: 'function',
  ARROW:    'arrow',
  CLASS:    'class',
  METHOD:   'method',
  IMPORT:   'import',
  EXPORT:   'export',
  INTERFACE:'interface',
  STRUCT:   'struct',
  NAMESPACE:'namespace',
  PACKAGE:  'package',
  CONSTRUCTOR:'constructor',
  VARIABLE: 'variable',
});

// ── Location factory ──────────────────────────────────────────────────────────

/**
 * Creates a Location object from a tree-sitter node.
 * Converts tree-sitter's 0-based row to 1-based line numbers.
 *
 * @param {object} node  — tree-sitter SyntaxNode
 */
export function locationFromNode(node) {
  return {
    startLine:   node.startPosition.row + 1,
    startColumn: node.startPosition.column,
    endLine:     node.endPosition.row + 1,
    endColumn:   node.endPosition.column,
  };
}

// ── AST Symbol Factories ──────────────────────────────────────────────────────

export function createFunction({ name, async: isAsync = false, generator = false, params = [], location, complexity = 1, hash = null }) {
  return { kind: SymbolKind.FUNCTION, name, async: isAsync, generator, params, location, complexity, hash };
}

export function createArrow({ name, async: isAsync = false, params = [], location, complexity = 1, hash = null }) {
  return { kind: SymbolKind.ARROW, name, async: isAsync, params, location, complexity, hash };
}

export function createClass({ name, superClass = null, location }) {
  return { kind: SymbolKind.CLASS, name, superClass, location };
}

export function createMethod({ name, className, static: isStatic = false, async: isAsync = false,
                               generator = false, visibility = 'public', params = [], location, decorators = [], complexity = 1, hash = null }) {
  return { kind: SymbolKind.METHOD, name, className, static: isStatic,
           async: isAsync, generator, visibility, params, location, decorators, complexity, hash };
}

export function createInterface({ name, location }) {
  return { kind: SymbolKind.INTERFACE, name, location };
}

export function createStruct({ name, location }) {
  return { kind: SymbolKind.STRUCT, name, location };
}

export function createNamespace({ name, location }) {
  return { kind: SymbolKind.NAMESPACE, name, location };
}

export function createPackage({ name, location }) {
  return { kind: SymbolKind.PACKAGE, name, location };
}

export function createConstructor({ className, params = [], visibility = 'public', location }) {
  return { kind: SymbolKind.CONSTRUCTOR, name: 'constructor', className, params, visibility, location };
}

export function createVariable({ name, location }) {
  return { kind: SymbolKind.VARIABLE, name, location };
}

export function createImport({ source, specifiers = [], location }) {
  return { kind: SymbolKind.IMPORT, source, specifiers, location };
}

export function createExport({ exportType, name = null, source = null, location }) {
  return { kind: SymbolKind.EXPORT, exportType, name, source, location };
}

export function createFileAnalysis({ filePath, language, lineCount = 0, symbols = [], hasErrors = false, error = null }) {
  return {
    filePath,
    language,
    lineCount,
    symbols,
    hasErrors,
    error,
    analyzedAt: new Date().toISOString(),
  };
}

// ── Static Analysis Factories (CodeLens Native Types) ───────────────────────

/**
 * Creates a standard analysis finding for Monaco Editor markers and Dashboard cards.
 */
export function createAnalysisFinding({ id, analyzerId, ruleId, category, severity, title, message, filePath, range, metrics = {}, suggestedAction = null }) {
  return { id, analyzerId, ruleId, category, severity, title, message, filePath, range, metrics, suggestedAction };
}

/**
 * Creates a React Flow compatible Node for Dependency and Architecture graphing.
 */
export function createAnalysisNode({ id, type = 'fileNode', position = { x: 0, y: 0 }, label, filePath = null, layer = 'unknown', healthScore = 100, metrics = { inDegree: 0, outDegree: 0, loc: 0, complexity: 0 }, findingsCount = { critical: 0, warning: 0 } }) {
  return {
    id,
    type,
    position,
    data: { label, filePath, layer, healthScore, metrics, findingsCount }
  };
}

/**
 * Creates a React Flow compatible Edge for Dependency Graphing.
 */
export function createAnalysisEdge({ id, source, target, type = 'default', animated = false, importCount = 1, isCircular = false, specifiers = [] }) {
  return {
    id,
    source,
    target,
    type,
    animated,
    data: { importCount, isCircular, specifiers }
  };
}

/**
 * Initializes the master payload structure used by the Frontend UI and IBM watsonx Proxy.
 */
export function createRepositoryIntelligencePayload({ repoId, fingerprint, totalFiles = 0, totalLinesOfCode = 0, languages = {} }) {
  return {
    repository: { repoId, fingerprint, totalFiles, totalLinesOfCode, languages },
    summary: { healthScore: 100, riskScore: 0, totalFindings: 0, criticalIssuesCount: 0 },
    domains: {
      complexity: { files: [], findings: [] },
      dependencies: { graph: { nodes: [], edges: [] }, circularDependencies: [], findings: [] },
      clones: { cloneGroups: [], findings: [] },
      architecture: { layers: [], boundaryViolations: [] },
      reachability: { entrypoints: [], unreachableFiles: [], unusedExports: [] }
    }
  };
}