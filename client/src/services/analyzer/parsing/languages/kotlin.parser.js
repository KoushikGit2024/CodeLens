/**
 * KotlinParser.js
 *
 * It initializes the Kotlin Tree-sitter parser, then extracts object-oriented and functional symbols,
 * and then it applies the canonical schemas to build intelligence structures.
 *
 * How this file is structured:
 *   1. extractSymbols()          — It initiates the tree walk, then extracts all symbols, and then it applies them to the output array.
 *   2. extractAdvancedFindings() — It defines Kotlin syntax queries, then extracts matching AST nodes, and then it applies the AnalysisFinding schema.
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
  SymbolKind,
} from '../symbols.js';
import { calculateComplexity } from '../../advanced/complexity.analyzer.js';
import { generateStructuralHash } from '../../advanced/clone.analyzer.js';

export class KotlinParser extends BaseParser {
  constructor(tsParser) {
    super(tsParser, 'kotlin');
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

    // It defines the unsafe unwrapping query, then extracts the postfix operator nodes, and then it applies the reliability warning schema.
    const unwrapQuery = `(postfix_unary_expression operator: "!!" @operator) @unwrapped`;
    findings.push(
      ...this.extractFindings(
        rootNode,
        unwrapQuery,
        filePath,
        'strictness',
        'BANG_BANG_OPERATOR',
        'reliability',
        'warning',
        'Unsafe Null Unwrapping (!!)',
        'Using `!!` forces null unwrapping and can lead to NullPointerExceptions. Use safe calls `?.` or Elvis operators `?:` instead.'
      )
    );

    // It defines the test annotation query, then extracts the test function declarations, and then it applies the architectural info schema.
    const testQuery = `
      (function_declaration (modifiers (annotation (user_type (type_identifier) @anno (#eq? @anno "Test"))))) @test_func
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
        'Kotlin Test Method',
        'Test method identified.'
      )
    );

    return findings;
  }

  // ── AST walker ──────────────────────────────────────────────────────────────

  /**
   * It evaluates the AST node type, then extracts Kotlin-specific declarations,
   * and then it applies the appropriate factory dispatchers.
   */
  _walk(node, source, symbols, className) {
    switch (node.type) {
      case 'package_header':
        this._extractPackage(node, source, symbols);
        return;

      case 'import_list':
        // It iterates through the import list, then extracts individual import headers, and then it applies the import extraction logic.
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (child.type === 'import_header') {
            this._extractImport(child, source, symbols);
          }
        }
        return;

      case 'import_header':
        this._extractImport(node, source, symbols);
        return;

      case 'class_declaration': {
        const isInterface = this._hasChildOfType(node, 'interface');
        if (isInterface) {
          this._extractInterface(node, source, symbols);
        } else {
          this._extractClass(node, source, symbols);
        }
        this._walkClassBody(node, source, symbols);
        return;
      }

      case 'object_declaration': {
        this._extractObject(node, source, symbols);
        this._walkClassBody(node, source, symbols);
        return;
      }

      case 'function_declaration': {
        this._extractFunction(node, source, symbols, className);
        return;
      }

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
   * It resolves the type identifier, then extracts the internal declarations,
   * and then it applies the class name context to nested methods.
   */
  _walkClassBody(classNode, source, symbols) {
    const name = this._typeIdentifierFromNode(classNode, source);
    const body = classNode.children.find(c => c.type === 'class_body');
    if (!body) return;

    for (let i = 0; i < body.childCount; i++) {
      const child = body.child(i);
      if (child.type === 'function_declaration') {
        this._extractFunction(child, source, symbols, name);
      } else if (child.type === 'class_declaration' || child.type === 'object_declaration') {
        this._walk(child, source, symbols, name);
      }
    }
  }

  // ── Symbol extractors ────────────────────────────────────────────────────────

  /**
   * It inspects the package header, then extracts the identifier text,
   * and then it applies the package symbol factory.
   */
  _extractPackage(node, source, symbols) {
    const identNode = node.children.find(c => c.type === 'identifier');
    const name = identNode ? nodeText(identNode, source) : null;
    if (name) {
      symbols.push(createPackage({ name, location: locationFromNode(node) }));
    }
  }

  /**
   * It checks the import header, then extracts the module name and wildcard flags,
   * and then it applies the unified import format.
   */
  _extractImport(node, source, symbols) {
    const identNode = node.children.find(c => c.type === 'identifier');
    if (!identNode) return;

    const moduleName = nodeText(identNode, source);
    const raw = nodeText(node, source).trim();
    const isWildcard = raw.endsWith('.*');
    const importedName = isWildcard ? '*' : moduleName.split('.').pop();

    symbols.push(
      createImport({
        source: moduleName,
        specifiers: [{ name: importedName, alias: null, type: isWildcard ? 'namespace' : 'default' }],
        location: locationFromNode(node),
      })
    );
  }

  /**
   * It parses the class declaration, then extracts the superclass from the delegation specifier,
   * and then it applies the class symbol structure.
   */
  _extractClass(node, source, symbols) {
    const name = this._typeIdentifierFromNode(node, source);
    let superClass = null;

    const delegSpec = node.children.find(c => c.type === 'delegation_specifier');
    if (delegSpec) {
      const ctorInvoc = delegSpec.children.find(c => c.type === 'constructor_invocation');
      const userType = ctorInvoc
        ? ctorInvoc.children.find(c => c.type === 'user_type')
        : delegSpec.children.find(c => c.type === 'user_type');

      if (userType) {
        const typeId = userType.children.find(c => c.type === 'type_identifier');
        superClass = typeId ? nodeText(typeId, source) : null;
      }
    }

    symbols.push(createClass({ name, superClass, location: locationFromNode(node) }));
  }

  /**
   * It parses the interface name, then extracts the location,
   * and then it applies the interface factory.
   */
  _extractInterface(node, source, symbols) {
    const name = this._typeIdentifierFromNode(node, source);
    symbols.push(createInterface({ name, location: locationFromNode(node) }));
  }

  /**
   * It reads the object declaration, then extracts its singleton name,
   * and then it applies the class factory since Kotlin objects are modeled as classes.
   */
  _extractObject(node, source, symbols) {
    const name = this._typeIdentifierFromNode(node, source);
    symbols.push(createClass({ name, superClass: null, location: locationFromNode(node) }));
  }

  /**
   * It targets the function declaration, then extracts the modifiers and parameters,
   * and then it applies the method symbol schema.
   */
  _extractFunction(node, source, symbols, className) {
    const nameNode = node.children.find(c => c.type === 'simple_identifier');
    if (!nameNode) return;
    const name = nodeText(nameNode, source);

    const modifiers = node.children.find(c => c.type === 'modifiers');
    const modText = modifiers ? nodeText(modifiers, source) : '';
    const isSuspend = modText.includes('suspend');
    const visibility = this._visibilityFromModText(modText);

    const params = this._extractParams(node, source);
    const complexity = calculateComplexity(node);
    const hash = generateStructuralHash(node);

    symbols.push(
      createMethod({
        name,
        className,
        static: false,
        visibility,
        async: isSuspend,
        generator: false,
        params,
        complexity,
        hash,
        location: locationFromNode(node),
      })
    );
  }

  // ── Utilities ────────────────────────────────────────────────────────────────

  /**
   * It navigates the function value parameters, then extracts the simple identifiers,
   * and then it applies them to the parameter list.
   */
  _extractParams(node, source) {
    const params = [];
    const paramsNode = node.children.find(c => c.type === 'function_value_parameters');
    if (!paramsNode) return params;

    for (let i = 0; i < paramsNode.childCount; i++) {
      const p = paramsNode.child(i);
      if (p.type === 'parameter') {
        const nameNode = p.children.find(c => c.type === 'simple_identifier');
        if (nameNode) params.push(nodeText(nameNode, source));
      }
    }
    return params;
  }

  /**
   * It searches for the type identifier child, then extracts the raw text,
   * and then it applies an anonymous fallback if missing.
   */
  _typeIdentifierFromNode(node, source) {
    const typeId = node.children.find(c => c.type === 'type_identifier');
    return typeId ? nodeText(typeId, source) : '<anonymous>';
  }

  /**
   * It iterates through all children, then extracts the node type,
   * and then it applies a true condition if a match is found.
   */
  _hasChildOfType(node, type) {
    for (let i = 0; i < node.childCount; i++) {
      if (node.child(i).type === type) return true;
    }
    return false;
  }

  /**
   * It evaluates the modifier text, then extracts the matching visibility string,
   * and then it applies public as the default fallback.
   */
  _visibilityFromModText(modText) {
    if (modText.includes('private')) return 'private';
    if (modText.includes('protected')) return 'protected';
    if (modText.includes('internal')) return 'internal';
    return 'public';
  }
}

// ── Module-level helpers ──────────────────────────────────────────────────────

/**
 * It identifies the byte indexes, then extracts the string slice,
 * and then it applies it as a textual representation.
 */
function nodeText(node, source) {
  return source.slice(node.startIndex, node.endIndex);
}
