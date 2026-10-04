/**
 * BaseParser.js
 *
 * Abstract base class for language-specific AST parsers.
 *
 * Every language parser (JavaScriptParser, TypeScriptParser, …) extends
 * this class and implements the `extractSymbols` method.
 *
 * Responsibilities:
 *   - Holds the tree-sitter Parser instance for the language.
 *   - Provides a safe `parseFile(source, filePath)` method that catches exceptions and
 *     wraps tree-sitter errors into structured results.
 *   - Provides Tree-sitter query helpers for deterministic static analysis.
 *   - Defines the contract that all language parsers must satisfy.
 */

import { createFileAnalysis } from '../symbols';

export class BaseParser {
  /**
   * @param {object} tsParser   — a configured tree-sitter Parser instance
   *                              (returned by parserRegistry.getParser)
   * @param {string} languageId — e.g. 'javascript'
   */
  constructor(tsParser, languageId) {
    if (new.target === BaseParser) {
      throw new Error('BaseParser is abstract — extend it instead.');
    }
    this.tsParser = tsParser;
    this.languageId = languageId;
  }

  /**
   * Parse source code and extract symbols.
   *
   * @param {string} source    — raw source code
   * @param {string} filePath  — relative file path
   * @returns {FileAnalysis}
   */
  parseFile(source, filePath) {
    if (!source || source.trim().length === 0) {
      return createFileAnalysis({ filePath, language: this.languageId, symbols: [] });
    }

    let tree;
    try {
      tree = this.tsParser.parse(source);
    } catch (err) {
      return createFileAnalysis({
        filePath,
        language: this.languageId,
        error: `Parser crash: ${err.message}`,
      });
    }

    // In web-tree-sitter 0.24+, hasError is often a function, not a boolean property
    const hasErrors = typeof tree.rootNode.hasError === 'function' ? tree.rootNode.hasError() : tree.rootNode.hasError;

    let symbols;
    try {
      symbols = this.extractSymbols(tree.rootNode, source);
    } catch (err) {
      return createFileAnalysis({
        filePath,
        language: this.languageId,
        hasErrors,
        error: `Symbol extraction error: ${err.message}`,
      });
    }

    let usages = [];
    try {
      usages = this.extractUsages ? this.extractUsages(tree.rootNode, source) : [];
    } catch (err) {
      console.warn(`[BaseParser] Usage extraction error for ${filePath}:`, err);
    } finally {
      if (tree) tree.delete();
    }

    return createFileAnalysis({ filePath, language: this.languageId, symbols, usages, hasErrors });
  }

  /**
   * Extract symbols from the AST root node.
   * MUST be implemented by every concrete subclass.
   *
   * @param {object} rootNode  — tree-sitter root SyntaxNode
   * @param {string} source    — original source code
   * @returns {Symbol[]}
   */
  // eslint-disable-next-line no-unused-vars
  extractSymbols(rootNode, source) {
    throw new Error(`${this.constructor.name} must implement extractSymbols()`);
  }

  /**
   * Executes a Tree-sitter S-expression query and extracts findings matching
   * the CodeLens canonical AnalysisFinding schema for the Monaco Editor and Dashboard.
   */
  extractFindings(
    rootNode,
    queryString,
    filePath,
    analyzerId,
    ruleId,
    category,
    severity,
    titleTemplate,
    messageTemplate
  ) {
    let query = null;
    try {
      const language = this.tsParser.getLanguage();
      query = language.query(queryString);
      const matches = query.matches(rootNode);

      return matches
        .map((match, index) => {
          const primaryCapture = match.captures[0];
          if (!primaryCapture) return null;
          const node = primaryCapture.node;

          return {
            id: `${analyzerId}-${ruleId}-${filePath}-${node.startPosition.row}-${index}`,
            analyzerId,
            ruleId,
            category,
            severity,
            title: titleTemplate.replace('{text}', node.text.substring(0, 40)),
            message: messageTemplate.replace('{text}', node.text),
            filePath,
            range: {
              startLine: node.startPosition.row + 1, // 1-based for Monaco
              startColumn: node.startPosition.column + 1,
              endLine: node.endPosition.row + 1,
              endColumn: node.endPosition.column + 1,
            },
            metrics: {},
          };
        })
        .filter(Boolean);
    } catch (error) {
      console.warn(`Query execution failed for ${ruleId} on ${filePath}:`, error);
      return [];
    } finally {
      if (query) query.delete();
    }
  }

  /**
   * Extracts string dependencies (imports/requires) to build the React Flow graph.
   */
  extractDependencies(rootNode, queryString) {
    let query = null;
    try {
      const language = this.tsParser.getLanguage();
      query = language.query(queryString);
      const matches = query.matches(rootNode);
      return matches.map(match => {
        const text = match.captures[0].node.text;
        return text.replace(/['"<>;]/g, ''); // Strip quotes and brackets
      });
    } catch {
      return [];
    } finally {
      if (query) query.delete();
    }
  }

  /**
   * Counts AST nodes representing structural data like cyclomatic complexity.
   */
  calculateComplexity(rootNode, queryString) {
    let query = null;
    try {
      const language = this.tsParser.getLanguage();
      query = language.query(queryString);
      return query.matches(rootNode).length;
    } catch {
      return 0;
    } finally {
      if (query) query.delete();
    }
  }
}
