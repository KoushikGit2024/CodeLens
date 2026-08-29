/**
 * JavaScriptParser.js
 *
 * Extracts symbols from JavaScript (and JSX) source files using Tree-sitter.
 *
 * Symbols extracted:
 *   - Function declarations:       function foo() {}
 *   - Async function declarations: async function foo() {}
 *   - Generator declarations:      function* gen() {}
 *   - Arrow functions (named):     const foo = () => {}
 *   - Class declarations:          class Foo extends Bar {}
 *   - Class methods:               Methods inside a class body
 *   - ES module imports:           import x from 'y'; import { a } from 'b'
 *   - CommonJS requires:           const x = require('y')  [as import symbol]
 *   - ES module exports:           export function foo() {}; export default foo
 *   - CommonJS exports:            module.exports = { ... }  [as export symbol]
 *
 * Tree-sitter grammar node types used:
 *   function_declaration, generator_function_declaration,
 *   arrow_function, class_declaration, class,
 *   method_definition, import_statement, export_statement,
 *   lexical_declaration, variable_declaration
 *
 * How this file is structured:
 *   1. extractSymbols()    — entry point, walks the top-level program nodes
 *   2. visitNode()         — dispatcher: routes each node type to an extractor
 *   3. extract*()          — one function per symbol type
 *   4. helper utilities    — parameter extraction, name extraction
 */

'use strict';

const { BaseParser } = require('./base.parser');
const {
  locationFromNode,
  createFunction,
  createArrow,
  createClass,
  createMethod,
  createImport,
  createExport,
  SymbolKind,
} = require('../symbols');

class JavaScriptParser extends BaseParser {
  constructor(tsParser) {
    super(tsParser, 'javascript');
  }

  // ── Public entry point ──────────────────────────────────────────────────────

  /**
   * Walk the AST and collect all symbols.
   * Called by BaseParser.parseFile().
   *
   * @param {object} rootNode   — tree-sitter root node (type: 'program')
   * @param {string} source     — original source text
   * @returns {Symbol[]}
   */
  extractSymbols(rootNode, source) {
    const symbols = [];
    this._walk(rootNode, source, symbols, null /* currentClassName */);
    return symbols;
  }

  // ── AST walker ──────────────────────────────────────────────────────────────

  /**
   * Recursively walk an AST node, collecting symbols into `symbols`.
   *
   * We do a depth-first walk.  Class bodies are handled specially so that
   * method extraction can record the containing class name.
   *
   * @param {object} node
   * @param {string} source
   * @param {Symbol[]} symbols        — accumulator
   * @param {string|null} className   — name of enclosing class, if any
   */
  _walk(node, source, symbols, className) {
    switch (node.type) {
      case 'function_declaration':
      case 'generator_function_declaration':
        this._extractFunction(node, source, symbols);
        // Walk into function body for nested functions
        this._walkChildren(node, source, symbols, null);
        return; // don't fall through to default child walk

      case 'class_declaration':
      case 'class':
        this._extractClass(node, source, symbols);
        // Walk class body with the class name so methods know their owner
        this._walkClassBody(node, source, symbols);
        return;

      case 'method_definition':
        if (className) {
          this._extractMethod(node, source, symbols, className);
        }
        // Walk method body for nested functions
        this._walkChildren(node, source, symbols, null);
        return;

      case 'lexical_declaration':    // const/let
      case 'variable_declaration':   // var
        this._extractArrowFromDeclaration(node, source, symbols);
        this._extractCommonJsRequire(node, source, symbols);
        this._walkChildren(node, source, symbols, className);
        return;

      case 'export_statement':
        this._extractExport(node, source, symbols);
        // Export may wrap a function/class — walk children so we pick up the inner symbol too
        this._walkChildren(node, source, symbols, className);
        return;

      case 'import_statement':
        this._extractImport(node, source, symbols);
        return; // imports have no interesting children

      case 'expression_statement':
        // Catches: module.exports = { ... }
        this._extractCommonJsExport(node, source, symbols);
        this._walkChildren(node, source, symbols, className);
        return;

      default:
        this._walkChildren(node, source, symbols, className);
    }
  }

  /** Walk all children of a node. */
  _walkChildren(node, source, symbols, className) {
    for (let i = 0; i < node.childCount; i++) {
      this._walk(node.child(i), source, symbols, className);
    }
  }

  /**
   * Walk the class body, passing the class name to child nodes so that
   * method_definition nodes can record their parent class.
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
   * Extract a function_declaration or generator_function_declaration.
   *
   * Handles:
   *   function greet(name) {}
   *   async function greet(name) {}
   *   function* gen() {}
   */
  _extractFunction(node, source, symbols) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return; // anonymous function expression — skip at top level

    const name      = nodeText(nameNode, source);
    const isAsync   = nodeHasChild(node, 'async');
    const isGen     = node.type === 'generator_function_declaration';
    const params    = this._extractParams(node, source);

    symbols.push(createFunction({
      name,
      async: isAsync,
      generator: isGen,
      params,
      location: locationFromNode(node),
    }));
  }

  /**
   * Extract an arrow function from a variable declarator.
   *
   * Handles:
   *   const greet = (name) => {}
   *   const add   = async (a, b) => a + b;
   *   export const handler = () => {}   (export wrapper handled separately)
   */
  _extractArrowFromDeclaration(node, source, symbols) {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type !== 'variable_declarator') continue;

      const valueNode = child.childForFieldName('value');
      if (!valueNode) continue;
      if (valueNode.type !== 'arrow_function') continue;

      const nameNode = child.childForFieldName('name');
      if (!nameNode) continue;

      const name    = nodeText(nameNode, source);
      const isAsync = nodeHasChild(valueNode, 'async');
      const params  = this._extractParams(valueNode, source);

      symbols.push(createArrow({
        name,
        async: isAsync,
        params,
        location: locationFromNode(child),
      }));
    }
  }

  /**
   * Extract a class declaration.
   *
   * Handles:
   *   class Animal {}
   *   class Dog extends Animal {}
   */
  _extractClass(node, source, symbols) {
    const name = this._classNameFromNode(node, source);

    // Superclass is inside a class_heritage node:  class Foo extends Bar {}
    // class_declaration: [ class, name, class_heritage?, class_body ]
    // class_heritage:    [ extends, identifier ]
    let superClass = null;
    const heritage = node.namedChildren.find(c => c.type === 'class_heritage');
    if (heritage) {
      const superNode = heritage.namedChildren.find(c => c.type === 'identifier' || c.type === 'member_expression');
      if (superNode) superClass = nodeText(superNode, source);
    }

    symbols.push(createClass({
      name,
      superClass,
      location: locationFromNode(node),
    }));
  }

  /**
   * Extract a method from inside a class body.
   *
   * Handles:
   *   constructor() {}
   *   speak() {}
   *   static create() {}
   *   async fetchData() {}
   *   get name() {}
   *   set name(v) {}
   */
  _extractMethod(node, source, symbols, className) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name      = nodeText(nameNode, source);
    const isStatic  = nodeHasChild(node, 'static');
    const isAsync   = nodeHasChild(node, 'async');
    const isGen     = nodeHasChild(node, '*');
    const params    = this._extractParams(node, source);

    symbols.push(createMethod({
      name,
      className,
      static: isStatic,
      async: isAsync,
      generator: isGen,
      params,
      location: locationFromNode(node),
    }));
  }

  /**
   * Extract an ES module import statement.
   *
   * Handles:
   *   import fs from 'fs'
   *   import { readFile, writeFile as wf } from 'fs'
   *   import * as path from 'path'
   *   import 'dotenv/config'
   */
  _extractImport(node, source, symbols) {
    const sourceNode = node.childForFieldName('source');
    if (!sourceNode) return;

    const moduleSource = stripQuotes(nodeText(sourceNode, source));
    const specifiers   = [];

    // The import clause is child(1) of import_statement:
    //   import [clause] from [source]
    // child(0) = 'import' keyword (anon)
    // child(1) = import_clause (if clause present) OR 'from' keyword (if side-effect)
    // child(2) = 'from' keyword (anon)  OR the source string (if side-effect)
    const child1 = node.child(1);
    const clauseNode = (child1 && child1.type === 'import_clause') ? child1 : null;

    if (!clauseNode) {
      // Side-effect import:  import 'dotenv/config'
      specifiers.push({ name: moduleSource, alias: null, type: 'side-effect' });
    } else {
      this._walkImportClause(clauseNode, source, specifiers);
    }

    symbols.push(createImport({
      source: moduleSource,
      specifiers,
      location: locationFromNode(node),
    }));
  }

  /** Walk an import clause node to extract specifiers. */
  _walkImportClause(clauseNode, source, specifiers) {
    for (let i = 0; i < clauseNode.childCount; i++) {
      const child = clauseNode.child(i);

      if (child.type === 'identifier') {
        // Default import:  import fs from 'fs'
        specifiers.push({ name: nodeText(child, source), alias: null, type: 'default' });

      } else if (child.type === 'namespace_import') {
        // Namespace import:  import * as path from 'path'
        const idNode = child.namedChildren.find(n => n.type === 'identifier');
        if (idNode) specifiers.push({ name: nodeText(idNode, source), alias: null, type: 'namespace' });

      } else if (child.type === 'named_imports') {
        // Named imports:  { readFile, writeFile as wf }
        for (const specNode of child.namedChildren) {
          if (specNode.type !== 'import_specifier') continue;
          const nameNode  = specNode.childForFieldName('name');
          const aliasNode = specNode.childForFieldName('alias');
          if (nameNode) {
            specifiers.push({
              name:  nodeText(nameNode, source),
              alias: aliasNode ? nodeText(aliasNode, source) : null,
              type:  'named',
            });
          }
        }
      }
    }
  }

  /**
   * Extract ES module export statements.
   *
   * Handles:
   *   export function foo() {}
   *   export const bar = ...
   *   export default foo
   *   export default function() {}
   *   export { foo, bar }
   *   export { foo as baz } from '../../../analyzers/module'
   *   export * from '../../../analyzers/module'
   */
  _extractExport(node, source, symbols) {
    const isDefault = nodeHasNamedChild(node, 'export_clause') === false
                   && this._nodeChildText(node, source).startsWith('export default');

    // Check for re-export source:  export { ... } from '../../../analyzers/x'
    const sourceNode = node.childForFieldName('source');
    const reexportSource = sourceNode ? stripQuotes(nodeText(sourceNode, source)) : null;

    // export default <expr|function|class>
    if (this._hasDirectChild(node, 'default')) {
      const valueNode = node.childForFieldName('value')
                     || node.childForFieldName('declaration');
      let name = null;
      if (valueNode) {
        if (valueNode.type === 'identifier') {
          name = nodeText(valueNode, source);
        } else if (valueNode.childForFieldName('name')) {
          name = nodeText(valueNode.childForFieldName('name'), source);
        }
      }
      symbols.push(createExport({
        exportType: 'default',
        name,
        source: null,
        location: locationFromNode(node),
      }));
      return;
    }

    // export { foo, bar } or export { foo } from '../../../analyzers/x'
    const clauseNode = this._findNamedChild(node, 'export_clause');
    if (clauseNode) {
      for (const spec of clauseNode.namedChildren) {
        if (spec.type !== 'export_specifier') continue;
        const nameNode = spec.childForFieldName('name');
        if (nameNode) {
          symbols.push(createExport({
            exportType: reexportSource ? 'reexport' : 'named',
            name: nodeText(nameNode, source),
            source: reexportSource,
            location: locationFromNode(spec),
          }));
        }
      }
      return;
    }

    // export * from '../../../analyzers/x'
    if (reexportSource) {
      symbols.push(createExport({
        exportType: 'reexport',
        name: '*',
        source: reexportSource,
        location: locationFromNode(node),
      }));
      return;
    }

    // export function foo() {} / export class Foo {} / export const bar = ...
    const declNode = node.childForFieldName('declaration');
    if (!declNode) return;

    const exportedNames = this._namesFromDeclaration(declNode, source);
    for (const name of exportedNames) {
      symbols.push(createExport({
        exportType: 'named',
        name,
        source: null,
        location: locationFromNode(node),
      }));
    }
  }

  /**
   * Extract CommonJS require() calls from a variable declaration.
   *
   * Handles:
   *   const User = require('../../../analyzers/models/User')
   *   const express = require('express')
   *   const { Router } = require('express')
   *   const { readFile: rf } = require('fs')
   *   var db = require('../../../analyzers/db')
   *
   * Emitted as an ImportSymbol with the same shape as ES module imports,
   * so that the dependency analyzer can treat both uniformly.
   * The specifier type is 'cjs-default' for the whole-module form and
   * 'cjs-named' for destructured forms.
   *
   * @param {object} node    — lexical_declaration or variable_declaration
   * @param {string} source
   * @param {Symbol[]} symbols
   */
  _extractCommonJsRequire(node, source, symbols) {
    for (let i = 0; i < node.childCount; i++) {
      const declarator = node.child(i);
      if (declarator.type !== 'variable_declarator') continue;

      const valueNode = declarator.childForFieldName('value');
      if (!valueNode) continue;

      // Support:  require('x')  or  require('x').something (member access after require)
      const callNode = _findRequireCall(valueNode, source);
      if (!callNode) continue;

      // Extract the module specifier string from the call arguments
      const argsNode = callNode.childForFieldName('arguments');
      if (!argsNode) continue;
      // First argument of require()
      const firstArg = argsNode.namedChildren[0];
      if (!firstArg) continue;
      if (firstArg.type !== 'string' && firstArg.type !== 'template_string') continue;

      const moduleSource = stripQuotes(nodeText(firstArg, source));
      const location     = locationFromNode(declarator);
      const specifiers   = [];

      const nameNode = declarator.childForFieldName('name');
      if (!nameNode) continue;

      if (nameNode.type === 'identifier') {
        // const User = require('../../../analyzers/models/User')
        specifiers.push({
          name:  nodeText(nameNode, source),
          alias: null,
          type:  'cjs-default',
        });
      } else if (nameNode.type === 'object_pattern') {
        // const { Router, Application } = require('express')
        for (const prop of nameNode.namedChildren) {
          if (prop.type === 'shorthand_property_identifier_pattern') {
            // { Router }
            specifiers.push({
              name:  nodeText(prop, source),
              alias: null,
              type:  'cjs-named',
            });
          } else if (prop.type === 'pair_pattern') {
            // { readFile: rf }
            const keyNode = prop.childForFieldName('key');
            const valNode = prop.childForFieldName('value');
            if (keyNode) {
              specifiers.push({
                name:  nodeText(keyNode, source),
                alias: valNode ? nodeText(valNode, source) : null,
                type:  'cjs-named',
              });
            }
          }
        }
      }

      if (specifiers.length === 0) continue;

      symbols.push(createImport({
        source:     moduleSource,
        specifiers,
        location,
      }));
    }
  }

  /**
   * Extract CommonJS module.exports assignments.
   *
   * Handles:
   *   module.exports = { foo, bar };
   *   module.exports = MyClass;
   *   module.exports.foo = function() {};
   */
  _extractCommonJsExport(node, source, symbols) {
    const expr = node.child(0);
    if (!expr || expr.type !== 'assignment_expression') return;

    const left = expr.childForFieldName('left');
    if (!left) return;

    const leftText = nodeText(left, source);
    if (!leftText.startsWith('module.exports')) return;

    const right = expr.childForFieldName('right');
    if (!right) return;

    const location = locationFromNode(node);

    if (right.type === 'identifier') {
      symbols.push(createExport({ exportType: 'default', name: nodeText(right, source), source: null, location }));
      return;
    }

    if (right.type === 'object') {
      for (const prop of right.namedChildren) {
        if (prop.type !== 'pair' && prop.type !== 'shorthand_property_identifier') continue;
        const keyNode = prop.childForFieldName('key') ?? prop;
        if (keyNode.type === 'identifier' || keyNode.type === 'shorthand_property_identifier') {
          symbols.push(createExport({
            exportType: 'named',
            name: nodeText(keyNode, source),
            source: null,
            location: locationFromNode(prop),
          }));
        }
      }
    }
  }

  // ── Parameter extraction ─────────────────────────────────────────────────────

  /**
   * Extract parameter names from a function-like node.
   * Complex patterns (destructuring, rest, default values) are represented
   * as '_' so that the parameter count is still correct.
   *
   * @param {object} fnNode   — function_declaration, method_definition, arrow_function
   * @param {string} source
   * @returns {string[]}
   */
  _extractParams(fnNode, source) {
    // Arrow functions with a single unparenthesized parameter use a different
    // field name and structure:   x => x * 2
    //   arrow_function: [ identifier "x", "=>", body ]
    //   The 'parameter' field (singular) is set.
    //
    // Arrow functions with parenthesized params:  (x, y) => ...
    //   arrow_function: [ formal_parameters "(x, y)", "=>", body ]
    //   The 'parameters' field (plural) is set.
    //
    // Regular functions and methods always use 'parameters'.

    // First try 'parameters' (formal_parameters node)
    const paramsNode = fnNode.childForFieldName('parameters');
    if (paramsNode) {
      return this._extractFromFormalParams(paramsNode, source);
    }

    // Then try 'parameter' (single unparenthesized arrow param)
    const singleParam = fnNode.childForFieldName('parameter');
    if (singleParam) {
      if (singleParam.type === 'identifier') {
        return [nodeText(singleParam, source)];
      }
      return ['_'];
    }

    return [];
  }

  /** Extract params from a formal_parameters node. */
  _extractFromFormalParams(paramsNode, source) {
    const params = [];
    for (const p of paramsNode.namedChildren) {
      switch (p.type) {
        case 'identifier':
          params.push(nodeText(p, source));
          break;
        // TypeScript: typed param  name: Type
        case 'required_parameter':
        case 'optional_parameter': {
          // first named child is the identifier (or pattern)
          const nameNode = p.namedChildren[0];
          if (nameNode && nameNode.type === 'identifier') {
            params.push(nodeText(nameNode, source));
          } else {
            params.push('_');
          }
          break;
        }
        case 'assignment_pattern': {
          const name = p.childForFieldName('left');
          // The left side may itself be a required_parameter in TS
          if (name && name.type === 'identifier') {
            params.push(nodeText(name, source));
          } else if (name) {
            const inner = name.namedChildren[0];
            params.push(inner && inner.type === 'identifier' ? nodeText(inner, source) : '_');
          } else {
            params.push('_');
          }
          break;
        }
        case 'rest_pattern': {
          const name = p.namedChildren.find(c => c.type === 'identifier');
          params.push(name ? `...${nodeText(name, source)}` : '..._');
          break;
        }
        default:
          params.push('_');
      }
    }
    return params;
  }

  // ── Utilities ────────────────────────────────────────────────────────────────

  _classNameFromNode(node, source) {
    const nameNode = node.childForFieldName('name');
    return nameNode ? nodeText(nameNode, source) : '<anonymous>';
  }

  _nodeChildText(node, source) {
    try { return nodeText(node, source); } catch { return ''; }
  }

  _hasDirectChild(node, type) {
    for (let i = 0; i < node.childCount; i++) {
      if (node.child(i).type === type) return true;
    }
    return false;
  }

  _findNamedChild(node, type) {
    for (let i = 0; i < node.childCount; i++) {
      const c = node.child(i);
      if (c.type === type) return c;
    }
    return null;
  }

  /**
   * Extract exported names from a declaration node.
   * Used for  export function foo() {}  and  export const a = 1, b = 2
   */
  _namesFromDeclaration(declNode, source) {
    const names = [];
    const nameNode = declNode.childForFieldName('name');
    if (nameNode) {
      names.push(nodeText(nameNode, source));
      return names;
    }
    // lexical/variable declaration: may have multiple declarators
    for (let i = 0; i < declNode.childCount; i++) {
      const c = declNode.child(i);
      if (c.type === 'variable_declarator') {
        const n = c.childForFieldName('name');
        if (n) names.push(nodeText(n, source));
      }
    }
    return names;
  }
}

// ── Module-level helpers ──────────────────────────────────────────────────────

/**
 * Extract the text of a node from the source string using byte positions.
 *
 * @param {object} node
 * @param {string} source
 * @returns {string}
 */
function nodeText(node, source) {
  return source.slice(node.startIndex, node.endIndex);
}

/**
 * Returns true if the node has a direct child with the given type.
 */
function nodeHasChild(node, type) {
  for (let i = 0; i < node.childCount; i++) {
    if (node.child(i).type === type) return true;
  }
  return false;
}

/**
 * Returns true if the node has a named child with the given type.
 * Unlike nodeHasChild, this only looks at named (non-anonymous) children.
 */
function nodeHasNamedChild(node, type) {
  return node.namedChildren.some(c => c.type === type);
}

/**
 * Remove surrounding quotes from a string literal value.
 */
function stripQuotes(str) {
  return str.replace(/^['"`]|['"`]$/g, '');
}

/**
 * Find a require() call_expression node inside a value node.
 *
 * Handles:
 *   require('x')                     — direct call
 *   require('x').default             — member access on require result
 *
 * @param {object} node    — value node from a variable_declarator
 * @param {string} source  — full source text
 * @returns {object|null}  — call_expression node, or null
 */
function _findRequireCall(node, source) {
  if (node.type === 'call_expression') {
    const fn = node.childForFieldName('function');
    if (fn && fn.type === 'identifier' && nodeText(fn, source) === 'require') {
      return node;
    }
  }
  // require('x').something  →  member_expression whose object is the call
  if (node.type === 'member_expression') {
    const obj = node.childForFieldName('object');
    if (obj) return _findRequireCall(obj, source);
  }
  return null;
}

module.exports = { JavaScriptParser };
