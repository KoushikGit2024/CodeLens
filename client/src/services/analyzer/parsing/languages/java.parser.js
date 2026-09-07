/**
 * JavaParser.js
 *
 * It initializes the Java Tree-sitter parser, then extracts object-oriented symbols, 
 * and then it applies the canonical schemas to build intelligence structures.
 *
 * How this file is structured:
 *   1. extractSymbols()          — It receives the root node, then extracts the AST symbols, and then it applies the accumulated array to the caller.
 *   2. extractAdvancedFindings() — It defines Java syntax queries, then extracts test and security nodes, and then it applies the AnalysisFinding schema.
 *   3. _walk()                   — It evaluates the AST node type, then extracts Java declarations, and then it applies the appropriate factory dispatchers.
 */

import { BaseParser } from './base.parser.js';
import {
  locationFromNode,
  createPackage,
  createImport,
  createClass,
  createMethod,
  createInterface,
  createConstructor
} from '../symbols.js';
import { calculateComplexity } from '../../advanced/complexity.analyzer.js';
import { generateStructuralHash } from '../../advanced/clone.analyzer.js';

export class JavaParser extends BaseParser {
  constructor(tsParser) {
    super(tsParser, 'java');
  }

  // ── Public entry points ─────────────────────────────────────────────────────

  /**
   * It receives the root node, then extracts the AST symbols, and then it applies the accumulated array to the caller.
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

    // It defines the command injection query, then extracts process execution nodes, and then it applies the critical security finding schema.
    const sinkQuery = `
      (method_invocation name: (identifier) @func (#match? @func "^(exec|start)$"))
    `;
    findings.push(...this.extractFindings(
      rootNode, sinkQuery, filePath, 'security', 'OS_COMMAND_INJECTION', 'security', 'critical',
      'Potential OS Command Injection',
      'Execution of system commands via `{text}` detected. Ensure inputs are highly sanitized.'
    ));

    // It specifies the JUnit annotation query, then extracts test method nodes, and then it applies the architectural info schema.
    const testQuery = `
      (method_declaration (modifiers (marker_annotation name: (identifier) @anno (#eq? @anno "Test")))) @test_method
    `;
    findings.push(...this.extractFindings(
      rootNode, testQuery, filePath, 'architecture', 'TEST_BLOCK', 'reliability', 'info',
      'JUnit Test Method',
      'Test method identified via @Test annotation.'
    ));

    return findings;
  }

  // ── AST walker ──────────────────────────────────────────────────────────────

  /**
   * It evaluates the AST node type, then extracts Java declarations, and then it applies the appropriate factory dispatchers.
   */
  _walk(node, source, symbols, className) {
    switch (node.type) {
      case 'package_declaration':
        this._extractPackage(node, source, symbols);
        return;

      case 'import_declaration':
        this._extractImport(node, source, symbols);
        return;

      case 'class_declaration':
        this._extractClass(node, source, symbols);
        // It resolves the class body, then extracts the internal nodes, and then it applies the class name context to inner methods.
        this._walkClassBody(node, source, symbols);
        return;

      case 'interface_declaration':
        this._extractInterface(node, source, symbols);
        // It resolves the interface body, then extracts the internal declarations, and then it applies the interface name context.
        this._walkClassBody(node, source, symbols);
        return;

      case 'method_declaration':
        if (className) {
          this._extractMethod(node, source, symbols, className);
        }
        // It enters the method body, then extracts inner constructs, and then it applies the recursive child walk.
        this._walkChildren(node, source, symbols, null);
        return;

      case 'constructor_declaration':
        if (className) {
          this._extractConstructor(node, source, symbols, className);
        }
        this._walkChildren(node, source, symbols, null);
        return;

      default:
        this._walkChildren(node, source, symbols, className);
    }
  }

  /**
   * It iterates over the child nodes, then extracts each syntax child, and then it applies the traversal switch.
   */
  _walkChildren(node, source, symbols, className) {
    for (let i = 0; i < node.childCount; i++) {
      this._walk(node.child(i), source, symbols, className);
    }
  }

  /**
   * It resolves the class identifier, then extracts the internal body nodes, and then it applies the class name context to inner methods.
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
   * It inspects the package declaration, then extracts the scoped identifier, and then it applies the package symbol factory.
   */
  _extractPackage(node, source, symbols) {
    let name = '';
    for (const child of node.namedChildren) {
        if (child.type === 'scoped_identifier' || child.type === 'identifier') {
            name = nodeText(child, source);
            break;
        }
    }
    if (name) {
      symbols.push(createPackage({
        name,
        location: locationFromNode(node),
      }));
    }
  }

  /**
   * It checks the import statement, then extracts the module and wildcard flags, and then it applies the unified import format.
   */
  _extractImport(node, source, symbols) {
    let isAsterisk = false;
    let moduleName = '';
    
    for (const child of node.namedChildren) {
      if (child.type === 'scoped_identifier' || child.type === 'identifier') {
          moduleName = nodeText(child, source);
      } else if (child.type === 'asterisk') {
          isAsterisk = true;
      }
    }

    if (moduleName) {
      const isStatic = nodeText(node, source).includes('static ');
      
      let specifiers;
      if (isAsterisk) {
          specifiers = [{ name: '*', alias: null, type: 'namespace' }];
      } else {
          specifiers = [{ name: moduleName, alias: null, type: isStatic ? 'named' : 'default' }];
      }

      symbols.push(createImport({
        source: moduleName,
        specifiers,
        location: locationFromNode(node),
      }));
    }
  }

  /**
   * It finds the class identifier, then extracts the superclass if present, and then it applies the class symbol structure.
   */
  _extractClass(node, source, symbols) {
    const name = this._classNameFromNode(node, source);
    let superClass = null;
    
    const superclassNode = node.childForFieldName('superclass');
    if (superclassNode) {
      const typeIdentifier = superclassNode.namedChildren[0];
      if (typeIdentifier) superClass = nodeText(typeIdentifier, source);
    }

    symbols.push(createClass({
      name,
      superClass,
      location: locationFromNode(node),
    }));
  }

  /**
   * It parses the interface name, then extracts the location, and then it applies the interface factory.
   */
  _extractInterface(node, source, symbols) {
    const name = this._classNameFromNode(node, source);
    symbols.push(createInterface({
      name,
      location: locationFromNode(node),
    }));
  }

  /**
   * It reads the method declaration, then extracts the parameters and complexity metrics, and then it applies the method symbol schema.
   */
  _extractMethod(node, source, symbols, className) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name       = nodeText(nameNode, source);
    const modifiers  = this._extractModifiers(node, source);
    const params     = this._extractParams(node, source);
    const complexity = calculateComplexity(node);
    const hash       = generateStructuralHash(node);

    symbols.push(createMethod({
      name,
      className,
      static: modifiers.includes('static'),
      visibility: this._getVisibility(modifiers),
      async: false,
      generator: false,
      params,
      complexity,
      hash,
      location: locationFromNode(node),
    }));
  }

  /**
   * It isolates the constructor node, then extracts modifiers and parameters, and then it applies the constructor schema.
   */
  _extractConstructor(node, source, symbols, className) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const modifiers = this._extractModifiers(node, source);
    const params    = this._extractParams(node, source);

    symbols.push(createConstructor({
      className,
      visibility: this._getVisibility(modifiers),
      params,
      location: locationFromNode(node),
    }));
  }

  // ── Utilities ────────────────────────────────────────────────────────────────

  /**
   * It navigates the formal parameters, then extracts the parameter names, and then it applies placeholders for complex patterns.
   */
  _extractParams(node, source) {
    const params = [];
    const paramsNode = node.childForFieldName('parameters');
    if (paramsNode) {
      for (const p of paramsNode.namedChildren) {
        if (p.type === 'formal_parameter' || p.type === 'spread_parameter') {
            const nameNode = p.childForFieldName('name');
            if (nameNode) {
                params.push(nodeText(nameNode, source));
            } else {
                params.push('_');
            }
        }
      }
    }
    return params;
  }

  /**
   * It scans the modifier list, then extracts individual text values, and then it applies them to the modifiers array.
   */
  _extractModifiers(node, source) {
    const modifiers = [];
    const modifiersNode = node.childForFieldName('modifiers');
    if (modifiersNode) {
        for (const mod of modifiersNode.namedChildren) {
            modifiers.push(nodeText(mod, source));
        }
    }
    return modifiers;
  }

  /**
   * It evaluates the modifier array, then extracts the matching visibility string, and then it applies package-private as the fallback.
   */
  _getVisibility(modifiers) {
      if (modifiers.includes('public')) return 'public';
      if (modifiers.includes('private')) return 'private';
      if (modifiers.includes('protected')) return 'protected';
      return 'package-private';
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