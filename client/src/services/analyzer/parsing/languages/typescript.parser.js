/**
 * TypeScriptParser.js
 *
 * Extracts symbols from TypeScript (and TSX) source files using Tree-sitter.
 *
 * TypeScript is a superset of JavaScript.  The tree-sitter TypeScript grammar
 * parses all valid JavaScript as well, so this parser extends JavaScriptParser
 * and adds TypeScript-specific symbol types:
 *
 *   - TypeScript interfaces      (interface_declaration)
 *   - TypeScript type aliases     (type_alias_declaration)
 *   - TypeScript access modifiers on class methods (public/private/protected)
 *
 * All JavaScript symbol types (functions, classes, imports, exports, arrows)
 * are inherited and work unchanged because the TS grammar uses identical node
 * types for them.
 *
 * We re-use the 'function' and 'class' SymbolKinds for TS function/class
 * declarations.  Interfaces and type aliases are emitted as 'class' and
 * 'function' symbols respectively with a flag indicating their TypeScript
 * origin, keeping the data model simple without introducing TS-only kinds.
 *
 * Node types specific to TypeScript grammar:
 *   interface_declaration
 *   type_alias_declaration
 *   accessibility_modifier  (on method_definition: public/private/protected)
 *   abstract_class_declaration
 */

'use strict';

import { JavaScriptParser } from './javascript.parser';
import {
  locationFromNode,
  createClass,
  createMethod,
  createFunction,
  SymbolKind,
} from '../symbols';

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

class TypeScriptParser extends JavaScriptParser {
  constructor(tsParser) {
    // Call JavaScriptParser constructor but override languageId
    super(tsParser);
    this.languageId = 'typescript';
  }

  // ── Override _walk to intercept TS-specific node types ────────────────────

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
   * Extract an interface declaration.
   *
   * interface User { id: number; name: string; }
   *
   * Emitted as a ClassSymbol with name suffix indicating it is an interface.
   * Using the 'class' kind makes the interface appear alongside classes in the
   * symbol list, which is where consumers expect it conceptually.
   *
   * The `tsKind` field is added to distinguish it from true classes.
   */
  _extractInterface(node, source, symbols) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nodeText(nameNode, source);
    const sym  = createClass({ name, superClass: null, location: locationFromNode(node) });
    sym.tsKind = 'interface'; // TypeScript-specific extension field
    symbols.push(sym);
  }

  /**
   * Extract a type alias.
   *
   * type UserId = string;
   * type Handler = (req: Request) => void;
   *
   * Emitted as a FunctionSymbol (type aliases are typically utility/structural
   * definitions that live alongside functions in an index).
   * The `tsKind` field is set to 'type' to distinguish from real functions.
   */
  _extractTypeAlias(node, source, symbols) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nodeText(nameNode, source);
    const sym  = createFunction({ name, async: false, generator: false, params: [], location: locationFromNode(node) });
    sym.tsKind = 'type'; // TypeScript-specific extension field
    symbols.push(sym);
  }

  /**
   * Extract a TypeScript class method, including access modifiers.
   *
   * class Foo {
   *   public greet(): void {}
   *   private _helper() {}
   *   protected compute(): number {}
   *   static create(): Foo {}
   * }
   */
  _extractMethodTS(node, source, symbols, className) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name     = nodeText(nameNode, source);
    const isStatic = nodeHasChild(node, 'static');
    const isAsync  = nodeHasChild(node, 'async');
    const isGen    = nodeHasChild(node, '*');
    const params   = this._extractParams(node, source);

    // TypeScript access modifier: first named child may be accessibility_modifier
    let visibility = 'public';
    for (let i = 0; i < node.childCount; i++) {
      const c = node.child(i);
      if (c.type === 'accessibility_modifier') {
        visibility = nodeText(c, source); // 'public' | 'private' | 'protected'
        break;
      }
    }

    const { createMethod } = require('../symbols');
    symbols.push(createMethod({
      name,
      className,
      static: isStatic,
      async: isAsync,
      generator: isGen,
      visibility,
      params,
      location: locationFromNode(node),
    }));
  }
}

export { TypeScriptParser };
