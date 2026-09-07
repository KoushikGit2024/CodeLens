/**
 * CParser.js
 *
 * It configures the C Tree-sitter parser, then extracts native procedural symbols, 
 * and then it applies the unified AST schemas for CodeLens intelligence.
 *
 * How this file is structured:
 *   1. extractSymbols()          — It initiates the tree walk, then extracts all symbols, and then it applies them to the output array.
 *   2. extractAdvancedFindings() — It defines C syntax queries, then extracts matching AST nodes, and then it applies the AnalysisFinding schema.
 *   3. _walk()                   — It examines the node type, then extracts specific language constructs, and then it applies the target extraction logic.
 */

import { BaseParser } from './base.parser.js';
import {
  locationFromNode,
  createImport,
  createStruct,
  createFunction,
} from '../symbols.js';
import { calculateComplexity } from '../../advanced/complexity.analyzer.js';
import { generateStructuralHash } from '../../advanced/clone.analyzer.js';

export class CParser extends BaseParser {
  constructor(tsParser) {
    super(tsParser, 'c');
  }

  // ── Public entry points ─────────────────────────────────────────────────────

  /**
   * It receives the top-level program node, then extracts the symbols via a depth-first walk, 
   * and then it applies the collected array to the caller.
   */
  extractSymbols(rootNode, source) {
    const symbols = [];
    this._walk(rootNode, source, symbols);
    return symbols;
  }

  /**
   * It receives the parsed AST root, then extracts the advanced static findings using S-expression queries, 
   * and then it applies the canonical AnalysisFinding schema for the frontend intelligence dashboard.
   */
  extractAdvancedFindings(rootNode, filePath) {
    const findings = [];

    // It defines the unsafe execution query, then extracts memory or system call nodes, and then it applies the critical security finding schema.
    const sinkQuery = `
      (call_expression function: (identifier) @func (#match? @func "^(system|popen|strcpy|sprintf|gets)$"))
    `;
    findings.push(...this.extractFindings(
      rootNode, sinkQuery, filePath, 'security', 'UNSAFE_MEMORY_OR_EXEC', 'security', 'critical',
      'Unsafe function call: {text}',
      'Usage of `{text}` is highly discouraged in C due to buffer overflow or command injection risks.'
    ));

    return findings;
  }

  // ── AST walker ──────────────────────────────────────────────────────────────

  /**
   * It inspects the current node type, then extracts the specific language construct, 
   * and then it applies the correct extraction method or walks the children.
   */
  _walk(node, source, symbols) {
    switch (node.type) {
      case 'preproc_include':
        this._extractInclude(node, source, symbols);
        return;

      case 'struct_specifier':
        this._extractStruct(node, source, symbols);
        // It captures the struct scope, then extracts inner fields, and then it applies the parent identity to them.
        this._walkChildren(node, source, symbols);
        return;

      case 'function_definition':
        this._extractFunction(node, source, symbols);
        // It enters the function body, then extracts internal blocks, and then it applies the recursive child walk.
        this._walkChildren(node, source, symbols);
        return;

      default:
        this._walkChildren(node, source, symbols);
    }
  }

  /**
   * It iterates over the child count, then extracts each child node, and then it applies the main walk switch.
   */
  _walkChildren(node, source, symbols) {
    for (let i = 0; i < node.childCount; i++) {
      this._walk(node.child(i), source, symbols);
    }
  }

  // ── Symbol extractors ────────────────────────────────────────────────────────

  /**
   * It evaluates the preprocessor directive, then extracts the string path or system bracket path, 
   * and then it applies the import symbol factory to track dependencies.
   */
  _extractInclude(node, source, symbols) {
    const pathNode = node.childForFieldName('path');
    if (!pathNode) return;

    let rawPath = nodeText(pathNode, source);
    let specifier = rawPath;
    let isExternal = true;

    if (specifier.startsWith('"') && specifier.endsWith('"')) {
        specifier = specifier.slice(1, -1);
        isExternal = false;
    } else if (specifier.startsWith('<') && specifier.endsWith('>')) {
        specifier = specifier.slice(1, -1);
        isExternal = true;
    }

    symbols.push(createImport({
      source: specifier,
      specifiers: [{ name: specifier, alias: null, type: isExternal ? 'external' : 'internal' }],
      location: locationFromNode(node),
    }));
  }

  /**
   * It reads the struct definition, then extracts its name, and then it applies the struct factory.
   */
  _extractStruct(node, source, symbols) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return; 

    symbols.push(createStruct({
      name: nodeText(nameNode, source),
      location: locationFromNode(node),
    }));
  }

  /**
   * It targets the function declarator, then extracts the core identifier, 
   * and then it applies the function factory.
   */
  _extractFunction(node, source, symbols) {
    const declarator = node.childForFieldName('declarator');
    if (!declarator) return;

    let coreDeclarator = declarator;
    while (coreDeclarator && (coreDeclarator.type === 'pointer_declarator')) {
        coreDeclarator = coreDeclarator.childForFieldName('declarator');
    }

    if (!coreDeclarator || coreDeclarator.type !== 'function_declarator') return;

    const nameNode = coreDeclarator.childForFieldName('declarator');
    if (!nameNode) return;

    const fnName = nodeText(nameNode, source);
    const params = this._extractParams(coreDeclarator, source);
    const complexity = calculateComplexity(node);
    const hash = generateStructuralHash(node);

    symbols.push(createFunction({
        name: fnName,
        async: false,
        generator: false,
        params,
        complexity,
        hash,
        location: locationFromNode(node),
    }));
  }

  // ── Utilities ────────────────────────────────────────────────────────────────

  /**
   * It scans the parameter list, then extracts individual parameter declarations, 
   * and then it applies fallback underscores for complex pointer combinations.
   */
  _extractParams(fnDeclaratorNode, source) {
    const params = [];
    const paramsNode = fnDeclaratorNode.childForFieldName('parameters');
    if (paramsNode) {
      for (const p of paramsNode.namedChildren) {
          if (p.type === 'parameter_declaration') {
              const decl = p.childForFieldName('declarator');
              if (decl) {
                  let coreDecl = decl;
                  while (coreDecl && (coreDecl.type === 'pointer_declarator')) {
                      coreDecl = coreDecl.childForFieldName('declarator');
                  }
                  if (coreDecl && coreDecl.type === 'identifier') {
                      params.push(nodeText(coreDecl, source));
                  } else {
                      params.push('_');
                  }
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
 * It identifies the byte indexes, then extracts the string slice, and then it applies it as a textual representation.
 */
function nodeText(node, source) {
  return source.slice(node.startIndex, node.endIndex);
}