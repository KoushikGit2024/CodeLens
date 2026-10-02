/**
 * TypeScriptParser.js
 *
 * It extends the JavaScript parser, then extracts TypeScript-specific syntax nodes,
 * and then it applies the shared static analysis schemas to the results.
 *
 * TypeScript is a superset of JavaScript. The tree-sitter TypeScript grammar
 * parses all valid JavaScript as well, so this parser extends JavaScriptParser
 * and adds TypeScript-specific symbol types:
 *
 *   - TypeScript interfaces      (interface_declaration)
 *   - TypeScript type aliases     (type_alias_declaration)
 *   - TypeScript access modifiers on class methods (public/private/protected)
 *
 * How this file is structured:
 *   1. extractAdvancedFindings() — It inherits JS findings, then extracts TS-specific type safety rules, and then it applies them to the finding array.
 *   2. _walk()                   — It intercepts TS-specific node types, then extracts them, and then it applies the JavaScript fallback for the rest.
 *   3. _extract*()               — It parses TypeScript syntax, then extracts the identifiers, and then it applies the canonical Symbol schema.
 */

import { JavaScriptParser } from './javascript.parser.js';
import { locationFromNode, createClass, createMethod, createFunction } from '../symbols.js';

// We need the nodeText helper — reproduce it here (it is not exported from JavaScriptParser)
function nodeText(node, source) {
  return source.slice(node.startIndex, node.endIndex);
}

function nodeHasChild(node, type) {
  for (let i = 0; i < node.childCount; i++) {
    if (node.child(i).type === type) return true;
  }
  return false;
}

export class TypeScriptParser extends JavaScriptParser {
  constructor(tsParser) {
    // Call JavaScriptParser constructor but override languageId
    super(tsParser);
    this.languageId = 'typescript';
  }

  // ── Override Findings to intercept TS-specific analysis ─────────────────────

  /**
   * It calls the base JS findings, then extracts TypeScript specific typing issues,
   * and then it applies them into a unified array of analysis findings.
   */
  extractAdvancedFindings(rootNode, filePath) {
    // Inherit JS analysis (SAST, Tests, Async Hygiene)
    const baseFindings = super.extractAdvancedFindings(rootNode, filePath);
    const tsFindings = [];

    // It defines the explicit any type query, then extracts the occurrences, and then it applies the maintainability warning schema.
    const anyTypeQuery = `(predefined_type) @type (#eq? @type "any")`;
    tsFindings.push(
      ...this.extractFindings(
        rootNode,
        anyTypeQuery,
        filePath,
        'strictness',
        'ANY_TYPE_USAGE',
        'maintainability',
        'warning',
        'Explicit `any` type used',
        "Using `any` defeats TypeScript's strict typing. Consider using `unknown` or a specific interface."
      )
    );

    // It isolates the exported declarations, then extracts the API boundary elements, and then it applies the architectural info schema.
    const exportQuery = `
      (export_statement declaration: (_) @exported_decl)
    `;
    tsFindings.push(
      ...this.extractFindings(
        rootNode,
        exportQuery,
        filePath,
        'architecture',
        'PUBLIC_API_SURFACE',
        'architecture',
        'info',
        'Public Export Detected',
        "This declaration is part of the file's public API surface."
      )
    );

    return [...baseFindings, ...tsFindings];
  }

  // ── Override _walk to intercept TS-specific node types ────────────────────

  /**
   * It evaluates the AST node type, then extracts interface/type declarations,
   * and then it applies the parent JavaScript parser walk for all other types.
   */
  _walk(node, source, symbols, className) {
    switch (node.type) {
      case 'interface_declaration':
        this._extractInterface(node, source, symbols);
        return;

      case 'type_alias_declaration':
        this._extractTypeAlias(node, source, symbols);
        return;

      case 'abstract_class_declaration':
        // Treat as a regular class
        this._extractClass(node, source, symbols);
        this._walkClassBody(node, source, symbols);
        return;

      case 'method_definition':
        if (className) {
          this._extractMethodTS(node, source, symbols, className);
        }
        this._walkChildren(node, source, symbols, null);
        return;

      default:
        // Delegate all other node types to JavaScriptParser
        super._walk(node, source, symbols, className);
    }
  }

  // ── TypeScript-specific extractors ────────────────────────────────────────

  /**
   * It locates the interface name, then extracts the identifier, and then it applies the class symbol factory with a tsKind tag.
   */
  _extractInterface(node, source, symbols) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nodeText(nameNode, source);
    const sym = createClass({ name, superClass: null, location: locationFromNode(node) });
    sym.tsKind = 'interface'; // TypeScript-specific extension field
    symbols.push(sym);
  }

  /**
   * It queries the type alias syntax, then extracts the type name, and then it applies the function symbol factory with a tsKind tag.
   */
  _extractTypeAlias(node, source, symbols) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nodeText(nameNode, source);
    const sym = createFunction({ name, async: false, generator: false, params: [], location: locationFromNode(node) });
    sym.tsKind = 'type'; // TypeScript-specific extension field
    symbols.push(sym);
  }

  /**
   * It checks for visibility modifiers, then extracts the method signature, and then it applies the method symbol factory.
   */
  _extractMethodTS(node, source, symbols, className) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nodeText(nameNode, source);
    const isStatic = nodeHasChild(node, 'static');
    const isAsync = nodeHasChild(node, 'async');
    const isGen = nodeHasChild(node, '*');
    const params = this._extractParams(node, source);

    // TypeScript access modifier: first named child may be accessibility_modifier
    let visibility = 'public';
    for (let i = 0; i < node.childCount; i++) {
      const c = node.child(i);
      if (c.type === 'accessibility_modifier') {
        visibility = nodeText(c, source); // 'public' | 'private' | 'protected'
        break;
      }
    }

    symbols.push(
      createMethod({
        name,
        className,
        static: isStatic,
        async: isAsync,
        generator: isGen,
        visibility,
        params,
        location: locationFromNode(node),
      })
    );
  }
}
