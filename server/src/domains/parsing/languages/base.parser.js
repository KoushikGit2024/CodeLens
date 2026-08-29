/**
 * BaseParser.js
 *
 * Abstract base class for language-specific AST parsers.
 *
 * Every language parser (JavaScriptParser, TypeScriptParser, …) must extend
 * this class and implement the `extractSymbols` method.
 *
 * Responsibilities:
 *   - Holds the tree-sitter Parser instance for the language.
 *   - Provides a safe `parse(source)` method that catches exceptions and
 *     wraps tree-sitter errors into structured results.
 *   - Defines the contract that all language parsers must satisfy.
 *
 * Design note:
 *   BaseParser is intentionally not abstract in the JavaScript sense because
 *   Node.js does not enforce it.  The convention is: if `extractSymbols` is
 *   not overridden, it throws, which makes the violation obvious in tests.
 */

'use strict';

const { createFileAnalysis } = require('../symbols');

class BaseParser {
  /**
   * @param {object} tsParser  — a configured tree-sitter Parser instance
   *                             (returned by parserRegistry.getParser)
   * @param {string} languageId — e.g. 'javascript'
   */
  constructor(tsParser, languageId) {
    if (new.target === BaseParser) {
      throw new Error('BaseParser is abstract — extend it instead.');
    }
    this.tsParser   = tsParser;
    this.languageId = languageId;
  }

  /**
   * Parse source code and extract symbols.
   *
   * This method is the safe entry point called by the analysis orchestrator.
   * It wraps `extractSymbols` so that any exception results in a FileAnalysis
   * with `error` set rather than an uncaught exception propagating upward.
   *
   * @param {string} source    — raw source code
   * @param {string} filePath  — relative file path (for error messages)
   * @returns {FileAnalysis}
   */
  parseFile(source, filePath) {
    // Empty file is valid — return an empty analysis
    if (!source || source.trim().length === 0) {
      return createFileAnalysis({ filePath, language: this.languageId, symbols: [] });
    }

    let tree;
    try {
      tree = this.tsParser.parse(source);
    } catch (err) {
      // tree-sitter itself crashed (should be extremely rare)
      return createFileAnalysis({
        filePath,
        language: this.languageId,
        error: `Parser crash: ${err.message}`,
      });
    }

    const hasErrors = tree.rootNode.hasError;

    let symbols;
    try {
      symbols = this.extractSymbols(tree.rootNode, source);
    } catch (err) {
      // Symbol extraction bug — return the parse error flag but do not abort
      return createFileAnalysis({
        filePath,
        language: this.languageId,
        hasErrors,
        error: `Symbol extraction error: ${err.message}`,
      });
    }

    return createFileAnalysis({ filePath, language: this.languageId, symbols, hasErrors });
  }

  /**
   * Extract symbols from the AST root node.
   *
   * MUST be implemented by every concrete subclass.
   *
   * @param {object} rootNode  — tree-sitter root SyntaxNode
   * @param {string} source    — original source code (needed for text extraction)
   * @returns {Symbol[]}       — array of symbols in source order
   */
  // eslint-disable-next-line no-unused-vars
  extractSymbols(rootNode, source) {
    throw new Error(`${this.constructor.name} must implement extractSymbols()`);
  }
}

module.exports = { BaseParser };
