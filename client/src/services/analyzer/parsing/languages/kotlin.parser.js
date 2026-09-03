/**
 * KotlinParser.js
 *
 * Extracts symbols from Kotlin source files using Tree-sitter.
 *
 * Symbols extracted:
 *   - package_header       → package
 *   - import_header        → import  (inside import_list)
 *   - class_declaration    → class | interface | data class
 *   - object_declaration   → object (treated as class)
 *   - function_declaration → method (top-level or member)
 *
 * Node type reference (confirmed via tree-sitter-kotlin WASM probe):
 *   class_declaration:  [modifiers?] [class|interface] [type_identifier] [primary_constructor?] [class_body?]
 *   object_declaration: [object] [type_identifier] [class_body?]
 *   function_declaration: [modifiers?] [fun] [simple_identifier] [function_value_parameters] [...]
 *   import_header:      [import] [identifier]
 *   package_header:     [package] [identifier]
 *   parameter:          [simple_identifier] [:] [type]
 */

'use strict';

import { BaseParser } from './base.parser';
import {
  locationFromNode,
  createPackage,
  createImport,
  createClass,
  createMethod,
  createInterface,
  SymbolKind,
} from '../symbols';

class KotlinParser extends BaseParser {
  constructor(tsParser) {
    super(tsParser, 'kotlin');
  }

  extractSymbols(rootNode, source) {
    const symbols = [];
    this._walk(rootNode, source, symbols, null);
    return symbols;
  }

  _walk(node, source, symbols, className) {
    switch (node.type) {
      case 'package_header':
        this._extractPackage(node, source, symbols);
        return;

      case 'import_list':
        // import_list contains one or more import_header children
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

  _walkChildren(node, source, symbols, className) {
    for (let i = 0; i < node.childCount; i++) {
      this._walk(node.child(i), source, symbols, className);
    }
  }

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

  _extractPackage(node, source, symbols) {
    // package_header: [package] [identifier]
    const identNode = node.children.find(c => c.type === 'identifier');
    const name = identNode ? nodeText(identNode, source) : null;
    if (name) {
      symbols.push(createPackage({ name, location: locationFromNode(node) }));
    }
  }

  _extractImport(node, source, symbols) {
    // import_header: [import] [identifier] [.*?]
    const identNode = node.children.find(c => c.type === 'identifier');
    if (!identNode) return;

    const moduleName = nodeText(identNode, source);
    // Check for wildcard: next sibling after identifier is `.*`
    const raw = nodeText(node, source).trim();
    const isWildcard = raw.endsWith('.*');
    const source_ = isWildcard ? moduleName : moduleName;
    const importedName = isWildcard ? '*' : moduleName.split('.').pop();

    symbols.push(createImport({
      source: moduleName,
      specifiers: [{ name: importedName, alias: null, type: isWildcard ? 'namespace' : 'default' }],
      location: locationFromNode(node),
    }));
  }

  _extractClass(node, source, symbols) {
    const name = this._typeIdentifierFromNode(node, source);
    let superClass = null;

    // Kotlin superclass: `class Dog : Animal()` produces a direct `delegation_specifier` child
    const delegSpec = node.children.find(c => c.type === 'delegation_specifier');
    if (delegSpec) {
      // delegation_specifier → constructor_invocation → user_type → type_identifier
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

  _extractInterface(node, source, symbols) {
    const name = this._typeIdentifierFromNode(node, source);
    symbols.push(createInterface({ name, location: locationFromNode(node) }));
  }

  _extractObject(node, source, symbols) {
    const name = this._typeIdentifierFromNode(node, source);
    // Objects are singletons; model as class
    symbols.push(createClass({ name, superClass: null, location: locationFromNode(node) }));
  }

  _extractFunction(node, source, symbols, className) {
    // function_declaration: [modifiers?] [fun] [simple_identifier] [function_value_parameters] ...
    const nameNode = node.children.find(c => c.type === 'simple_identifier');
    if (!nameNode) return;
    const name = nodeText(nameNode, source);

    const modifiers = node.children.find(c => c.type === 'modifiers');
    const modText = modifiers ? nodeText(modifiers, source) : '';
    const isSuspend = modText.includes('suspend');
    const visibility = this._visibilityFromModText(modText);

    const params = this._extractParams(node, source);

    symbols.push(createMethod({
      name,
      className,
      static: false,
      visibility,
      async: isSuspend,
      generator: false,
      params,
      location: locationFromNode(node),
    }));
  }

  _extractParams(node, source) {
    const params = [];
    const paramsNode = node.children.find(c => c.type === 'function_value_parameters');
    if (!paramsNode) return params;
    for (let i = 0; i < paramsNode.childCount; i++) {
      const p = paramsNode.child(i);
      if (p.type === 'parameter') {
        // parameter: [simple_identifier] [:] [type]
        const nameNode = p.children.find(c => c.type === 'simple_identifier');
        if (nameNode) params.push(nodeText(nameNode, source));
      }
    }
    return params;
  }

  _typeIdentifierFromNode(node, source) {
    const typeId = node.children.find(c => c.type === 'type_identifier');
    return typeId ? nodeText(typeId, source) : '<anonymous>';
  }

  _hasChildOfType(node, type) {
    for (let i = 0; i < node.childCount; i++) {
      if (node.child(i).type === type) return true;
    }
    return false;
  }

  _visibilityFromModText(modText) {
    if (modText.includes('private')) return 'private';
    if (modText.includes('protected')) return 'protected';
    if (modText.includes('internal')) return 'internal';
    return 'public'; // Kotlin default is public
  }
}

function nodeText(node, source) {
  return source.slice(node.startIndex, node.endIndex);
}

export { KotlinParser };
