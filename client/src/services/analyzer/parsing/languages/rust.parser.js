/**
 * RustParser.js
 *
 * It initializes the Rust Tree-sitter parser, then extracts systems-level symbols,
 * and then it applies the canonical schemas to build intelligence structures.
 *
 * How this file is structured:
 *   1. extractSymbols()          — It initiates the tree walk, then extracts all symbols, and then it applies them to the output array.
 *   2. extractAdvancedFindings() — It defines Rust syntax queries, then extracts matching AST nodes, and then it applies the AnalysisFinding schema.
 *   3. _walk()                   — It examines the node type, then extracts specific language constructs, and then it applies the target extraction logic.
 */

import { BaseParser } from './base.parser.js';
import {
  locationFromNode,
  createPackage,
  createImport,
  createClass,
  createMethod,
  createInterface,
  createStruct,
  createFunction,
  createNamespace,
} from '../symbols.js';
import { calculateComplexity } from '../../advanced/complexity.analyzer.js';
import { generateStructuralHash } from '../../advanced/clone.analyzer.js';

export class RustParser extends BaseParser {
  constructor(tsParser) {
    super(tsParser, 'rust');
  }

  // ── Public entry points ─────────────────────────────────────────────────────

  /**
   * It receives the top-level program node, then extracts the symbols via a depth-first walk,
   * and then it applies the collected array to the caller.
   */
  extractSymbols(rootNode, source) {
    const symbols = [];
    this._walk(rootNode, source, symbols, null);
    return symbols;
  }

  /**
   * It receives the parsed AST root, then extracts the advanced static findings using S-expression queries,
   * and then it applies the canonical AnalysisFinding schema for the frontend intelligence dashboard.
   */
  extractAdvancedFindings(rootNode, filePath) {
    const findings = [];

    // It defines the unsafe block query, then extracts memory-unsafe regions, and then it applies the security warning schema.
    const unsafeQuery = `(unsafe_block) @unsafe`;
    findings.push(
      ...this.extractFindings(
        rootNode,
        unsafeQuery,
        filePath,
        'security',
        'UNSAFE_MEMORY_BLOCK',
        'security',
        'warning',
        'Unsafe Block Detected',
        "Usage of `unsafe` detected. This bypasses Rust's memory safety guarantees and should be strictly audited."
      )
    );

    // It defines the test macro query, then extracts the test function items, and then it applies the architectural info schema.
    const testQuery = `
      (function_item (attribute_item (attribute (identifier) @attr (#eq? @attr "test")))) @test_fn
    `;
    findings.push(
      ...this.extractFindings(
        rootNode,
        testQuery,
        filePath,
        'architecture',
        'TEST_BLOCK',
        'reliability',
        'info',
        'Rust Test Function',
        'Test function identified via `#[test]` attribute.'
      )
    );

    return findings;
  }

  // ── AST walker ──────────────────────────────────────────────────────────────

  /**
   * It evaluates the AST node type, then extracts Rust-specific declarations,
   * and then it applies the appropriate factory dispatchers.
   */
  _walk(node, source, symbols, className) {
    switch (node.type) {
      case 'mod_item':
        this._extractModule(node, source, symbols);
        // It enters the module body, then extracts nested items, and then it applies the recursive child walk.
        this._walkChildren(node, source, symbols, null);
        return;

      case 'use_declaration':
        this._extractImport(node, source, symbols);
        return;

      case 'struct_item':
      case 'enum_item':
        this._extractStructOrEnum(node, source, symbols);
        return;

      case 'trait_item':
        this._extractTrait(node, source, symbols);
        return;

      case 'impl_item':
        // It captures the implemented type name, then extracts the block items, and then it applies the context to inner methods.
        this._walkImplBody(node, source, symbols);
        return;

      case 'function_item':
        this._extractFunctionOrMethod(node, source, symbols, className);
        this._walkChildren(node, source, symbols, null);
        return;

      default:
        this._walkChildren(node, source, symbols, className);
    }
  }

  /**
   * It iterates over the child nodes, then extracts each syntax child,
   * and then it applies the traversal switch.
   */
  _walkChildren(node, source, symbols, className) {
    for (let i = 0; i < node.childCount; i++) {
      this._walk(node.child(i), source, symbols, className);
    }
  }

  /**
   * It locates the impl block type, then extracts the declaration list,
   * and then it applies the implementation type as the class name for nested methods.
   */
  _walkImplBody(implNode, source, symbols) {
    const typeNode = implNode.childForFieldName('type');
    if (!typeNode) return;

    const className = nodeText(typeNode, source);
    const body = implNode.childForFieldName('body'); // declaration_list

    if (!body) return;
    for (let i = 0; i < body.childCount; i++) {
      this._walk(body.child(i), source, symbols, className);
    }
  }

  // ── Symbol extractors ────────────────────────────────────────────────────────

  /**
   * It inspects the module item, then extracts the identifier,
   * and then it applies the namespace symbol factory.
   */
  _extractModule(node, source, symbols) {
    const nameNode = node.childForFieldName('name');
    if (nameNode) {
      symbols.push(
        createNamespace({
          name: nodeText(nameNode, source),
          location: locationFromNode(node),
        })
      );
    }
  }

  /**
   * It evaluates the use declaration, then extracts the raw module path,
   * and then it applies string formatting to generate a unified import symbol.
   */
  _extractImport(node, source, symbols) {
    const argumentNode = node.childForFieldName('argument');
    if (!argumentNode) return;

    const rawPath = nodeText(argumentNode, source);
    const isWildcard = rawPath.endsWith('::*');
    const importedName = isWildcard ? '*' : rawPath.split('::').pop().replace(/[{}]/g, '');

    symbols.push(
      createImport({
        source: rawPath.replace(/::\*$/, '').replace(/::{.*}$/, ''),
        specifiers: [{ name: importedName, alias: null, type: isWildcard ? 'namespace' : 'default' }],
        location: locationFromNode(node),
      })
    );
  }

  /**
   * It parses the struct or enum item, then extracts the identifier,
   * and then it applies the struct factory.
   */
  _extractStructOrEnum(node, source, symbols) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    symbols.push(
      createStruct({
        name: nodeText(nameNode, source),
        location: locationFromNode(node),
      })
    );
  }

  /**
   * It reads the trait item, then extracts its name,
   * and then it applies the interface factory since traits act as interfaces.
   */
  _extractTrait(node, source, symbols) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    symbols.push(
      createInterface({
        name: nodeText(nameNode, source),
        location: locationFromNode(node),
      })
    );
  }

  /**
   * It targets the function item, then extracts parameters to check for 'self',
   * and then it applies either the method or function factory based on scope qualification.
   */
  _extractFunctionOrMethod(node, source, symbols, className) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nodeText(nameNode, source);
    const params = this._extractParams(node, source);

    // It checks the parameter array, then extracts the presence of 'self', and then it applies static or instance logic.
    const isStatic = className ? !params.some(p => p === 'self' || p.includes('self')) : false;

    const complexity = calculateComplexity(node);
    const hash = generateStructuralHash(node);

    if (className) {
      symbols.push(
        createMethod({
          name,
          className,
          static: isStatic,
          visibility: 'public', // Rust visibility requires parsing `pub` modifiers, defaulting to public for struct completeness
          async: nodeText(node, source).startsWith('async'),
          generator: false,
          params,
          complexity,
          hash,
          location: locationFromNode(node),
        })
      );
    } else {
      symbols.push(
        createFunction({
          name,
          async: nodeText(node, source).startsWith('async'),
          generator: false,
          params,
          complexity,
          hash,
          location: locationFromNode(node),
        })
      );
    }
  }

  // ── Utilities ────────────────────────────────────────────────────────────────

  /**
   * It navigates the parameters node, then extracts individual parameter patterns,
   * and then it applies them to the output string array.
   */
  _extractParams(fnNode, source) {
    const params = [];
    const paramsNode = fnNode.childForFieldName('parameters');
    if (paramsNode) {
      for (let i = 0; i < paramsNode.childCount; i++) {
        const p = paramsNode.child(i);
        if (p.type === 'parameter' || p.type === 'self_parameter') {
          // It evaluates the self parameter, then extracts its keyword directly, and then it applies it to the array.
          if (p.type === 'self_parameter') {
            params.push(nodeText(p, source));
            continue;
          }
          const patternNode = p.childForFieldName('pattern');
          if (patternNode) {
            params.push(nodeText(patternNode, source));
          } else {
            params.push('_');
          }
        }
      }
    }
    return params;
  }
}

// ── Module-level helpers ──────────────────────────────────────────────────────

/**
 * It isolates the byte indexes, then extracts the string slice,
 * and then it applies it as a textual representation.
 */
function nodeText(node, source) {
  return source.slice(node.startIndex, node.endIndex);
}
