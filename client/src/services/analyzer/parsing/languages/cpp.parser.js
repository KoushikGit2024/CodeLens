/**
 * CppParser.js
 *
 * It configures the C++ Tree-sitter parser, then extracts native symbols, 
 * and then it applies the unified AST schemas for CodeLens intelligence.
 *
 * How this file is structured:
 *   1. extractSymbols()          — It initiates the tree walk, then extracts all symbols, and then it applies them to the output array.
 *   2. extractAdvancedFindings() — It defines C++ specific syntax queries, then extracts matching AST nodes, and then it applies the AnalysisFinding schema.
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
  SymbolKind,
} from '../symbols.js';
import { calculateComplexity } from '../../advanced/complexity.analyzer.js';
import { generateStructuralHash } from '../../advanced/clone.analyzer.js';

export class CppParser extends BaseParser {
  constructor(tsParser) {
    super(tsParser, 'cpp');
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

    // It defines the unsafe execution query, then extracts memory or system call nodes, and then it applies the critical security finding schema.
    const sinkQuery = `
      (call_expression function: (identifier) @func (#match? @func "^(system|popen|strcpy|sprintf)$"))
    `;
    findings.push(...this.extractFindings(
      rootNode, sinkQuery, filePath, 'security', 'UNSAFE_MEMORY_OR_EXEC', 'security', 'critical',
      'Unsafe function call: {text}',
      'Usage of `{text}` is discouraged due to buffer overflow or command injection risks.'
    ));

    // It defines the Google Test macro query, then extracts the test call expressions, and then it applies the architectural info schema.
    const testQuery = `
      (call_expression function: (identifier) @func (#match? @func "^(TEST|TEST_F)$"))
    `;
    findings.push(...this.extractFindings(
      rootNode, testQuery, filePath, 'architecture', 'TEST_BLOCK', 'reliability', 'info',
      'GTest identified',
      'Google Test macro detected.'
    ));

    return findings;
  }

  // ── AST walker ──────────────────────────────────────────────────────────────

  /**
   * It inspects the current node type, then extracts the specific language construct, 
   * and then it applies the correct extraction method or walks the children.
   */
  _walk(node, source, symbols, className) {
    switch (node.type) {
      case 'preproc_include':
        this._extractInclude(node, source, symbols);
        return;

      case 'namespace_definition':
        this._extractNamespace(node, source, symbols);
        // It accesses the namespace body, then extracts the internal declarations, and then it applies the namespace scope to its children.
        this._walkClassBody(node, source, symbols);
        return;

      case 'class_specifier':
        this._extractClass(node, source, symbols);
        // It captures the class scope, then extracts the inner methods and fields, and then it applies the parent identity to them.
        this._walkClassBody(node, source, symbols);
        return;

      case 'struct_specifier':
        this._extractStruct(node, source, symbols);
        this._walkClassBody(node, source, symbols);
        return;

      case 'function_definition':
        this._extractFunctionOrMethod(node, source, symbols, className);
        // It enters the function body, then extracts internal blocks, and then it applies the recursive child walk.
        this._walkChildren(node, source, symbols, null);
        return;

      default:
        this._walkChildren(node, source, symbols, className);
    }
  }

  /**
   * It iterates over the child count, then extracts each child node, and then it applies the main walk switch.
   */
  _walkChildren(node, source, symbols, className) {
    for (let i = 0; i < node.childCount; i++) {
      this._walk(node.child(i), source, symbols, className);
    }
  }

  /**
   * It locates the class or struct body, then extracts the field declaration list, and then it applies the enclosing name to the traversal.
   */
  _walkClassBody(classNode, source, symbols) {
    const name = this._classNameFromNode(classNode, source);
    const body = classNode.childForFieldName('body');
    if (!body) return;
    for (let i = 0; i < body.childCount; i++) {
      this._walk(body.child(i), source, symbols, name);
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
   * It finds the namespace identifier, then extracts its raw text, and then it applies the namespace factory.
   */
  _extractNamespace(node, source, symbols) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    symbols.push(createNamespace({
      name: nodeText(nameNode, source),
      location: locationFromNode(node),
    }));
  }

  /**
   * It parses the class declaration, then extracts the class name, and then it applies the class symbol structure.
   */
  _extractClass(node, source, symbols) {
    const name = this._classNameFromNode(node, source);
    if (!name || name === '<anonymous>') return; 

    symbols.push(createClass({
      name,
      superClass: null, 
      location: locationFromNode(node),
    }));
  }

  /**
   * It reads the struct definition, then extracts its name, and then it applies the struct factory.
   */
  _extractStruct(node, source, symbols) {
    const name = this._classNameFromNode(node, source);
    if (!name || name === '<anonymous>') return;

    symbols.push(createStruct({
      name,
      location: locationFromNode(node),
    }));
  }

  /**
   * It targets the function declarator, then extracts the core identifier through pointers/references, 
   * and then it applies either the method or function factory based on scope qualification.
   */
  _extractFunctionOrMethod(node, source, symbols, currentClassName) {
    const declarator = node.childForFieldName('declarator');
    if (!declarator) return;

    let coreDeclarator = declarator;
    while (coreDeclarator && (coreDeclarator.type === 'pointer_declarator' || coreDeclarator.type === 'reference_declarator')) {
        coreDeclarator = coreDeclarator.childForFieldName('declarator');
    }

    if (!coreDeclarator || coreDeclarator.type !== 'function_declarator') return;

    const nameNode = coreDeclarator.childForFieldName('declarator');
    if (!nameNode) return;

    let fnName = nodeText(nameNode, source);
    let className = currentClassName;
    let isMethod = !!className;

    if (nameNode.type === 'qualified_identifier') {
        const scope = nameNode.childForFieldName('scope');
        const name = nameNode.childForFieldName('name');
        if (scope && name) {
            className = nodeText(scope, source);
            fnName = nodeText(name, source);
            isMethod = true;
        }
    }

    const params     = this._extractParams(coreDeclarator, source);
    const complexity = calculateComplexity(node);
    const hash       = generateStructuralHash(node);

    if (isMethod) {
        symbols.push(createMethod({
            name: fnName,
            className: className,
            static: false, 
            async: false,
            generator: false,
            params,
            complexity,
            hash,
            location: locationFromNode(node),
        }));
    } else {
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
  }

  // ── Utilities ────────────────────────────────────────────────────────────────

  /**
   * It scans the parameter list, then extracts individual parameter declarations, 
   * and then it applies fallback underscores for complex pointer/reference combinations.
   */
  _extractParams(fnDeclaratorNode, source) {
    const params = [];
    const paramsNode = fnDeclaratorNode.childForFieldName('parameters');
    if (paramsNode) {
      for (const p of paramsNode.namedChildren) {
          if (p.type === 'parameter_declaration' || p.type === 'optional_parameter_declaration') {
              const decl = p.childForFieldName('declarator');
              if (decl) {
                  let coreDecl = decl;
                  while (coreDecl && (coreDecl.type === 'pointer_declarator' || coreDecl.type === 'reference_declarator')) {
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

  /**
   * It targets the name field, then extracts the raw text, and then it applies an anonymous fallback if missing.
   */
  _classNameFromNode(node, source) {
    const nameNode = node.childForFieldName('name');
    return nameNode ? nodeText(nameNode, source) : '<anonymous>';
  }
}

// ── Module-level helpers ──────────────────────────────────────────────────────

/**
 * It identifies the byte indexes, then extracts the string slice, and then it applies it as a textual representation.
 */
function nodeText(node, source) {
  return source.slice(node.startIndex, node.endIndex);
}