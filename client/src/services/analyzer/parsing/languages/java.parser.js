/**
 * JavaParser.js
 *
 * Extracts symbols from Java source files using Tree-sitter.
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
  createStruct,
  createFunction,
  createNamespace,
  SymbolKind,
} from '../symbols';

class JavaParser extends BaseParser {
  constructor(tsParser) {
    super(tsParser, 'java');
  }

  extractSymbols(rootNode, source) {
    const symbols = [];
    this._walk(rootNode, source, symbols, null);
    return symbols;
  }

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
        this._walkClassBody(node, source, symbols);
        return;

      case 'interface_declaration':
        this._extractInterface(node, source, symbols);
        this._walkClassBody(node, source, symbols);
        return;

      case 'method_declaration':
        if (className) {
          this._extractMethod(node, source, symbols, className);
        }
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

  _walkChildren(node, source, symbols, className) {
    for (let i = 0; i < node.childCount; i++) {
      this._walk(node.child(i), source, symbols, className);
    }
  }

  _walkClassBody(classNode, source, symbols) {
    const name = this._classNameFromNode(classNode, source);
    const body = classNode.childForFieldName('body');
    if (!body) return;
    for (let i = 0; i < body.childCount; i++) {
      this._walk(body.child(i), source, symbols, name);
    }
  }

  _extractPackage(node, source, symbols) {
    // package_declaration: package com.example;
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

  _extractImport(node, source, symbols) {
    // import_declaration: import com.example.Foo; import java.util.*;
    let isAsterisk = false;
    let moduleName = '';
    
    // In Java tree-sitter, wildcard imports usually look like:
    // import_declaration [ identifier, asterisk ] or [ scoped_identifier, asterisk ]
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
          // Last part is the class/method, the rest is package. But for dependency graph, we treat the whole string as the source to resolve if internal, or external.
          specifiers = [{ name: moduleName, alias: null, type: isStatic ? 'named' : 'default' }];
      }

      symbols.push(createImport({
        source: moduleName,
        specifiers,
        location: locationFromNode(node),
      }));
    }
  }

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

  _extractInterface(node, source, symbols) {
    const name = this._classNameFromNode(node, source);
    symbols.push(createInterface({
      name,
      location: locationFromNode(node),
    }));
  }

  _extractMethod(node, source, symbols, className) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nodeText(nameNode, source);
    const modifiers = this._extractModifiers(node, source);
    const params = this._extractParams(node, source);

    symbols.push(createMethod({
      name,
      className,
      static: modifiers.includes('static'),
      visibility: this._getVisibility(modifiers),
      async: false,
      generator: false,
      params,
      location: locationFromNode(node),
    }));
  }

  _extractConstructor(node, source, symbols, className) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const modifiers = this._extractModifiers(node, source);
    const params = this._extractParams(node, source);

    symbols.push(createConstructor({
      className,
      visibility: this._getVisibility(modifiers),
      params,
      location: locationFromNode(node),
    }));
  }

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

  _getVisibility(modifiers) {
      if (modifiers.includes('public')) return 'public';
      if (modifiers.includes('private')) return 'private';
      if (modifiers.includes('protected')) return 'protected';
      return 'package-private';
  }

  _classNameFromNode(node, source) {
    const nameNode = node.childForFieldName('name');
    return nameNode ? nodeText(nameNode, source) : '<anonymous>';
  }
}

function nodeText(node, source) {
  return source.slice(node.startIndex, node.endIndex);
}

export { JavaParser };
