/**
 * PythonParser.js
 *
 * Extracts symbols from Python source files using Tree-sitter.
 */

'use strict';

const { BaseParser } = require('./base.parser');
const {
  locationFromNode,
  createFunction,
  createClass,
  createMethod,
  createImport,
  createVariable,
} = require('../symbols');

class PythonParser extends BaseParser {
  constructor(tsParser) {
    super(tsParser, 'python');
  }

  extractSymbols(rootNode, source) {
    const symbols = [];
    this._walk(rootNode, source, symbols, null);
    return symbols;
  }

  _walk(node, source, symbols, className) {
    switch (node.type) {
      case 'function_definition':
        if (className) {
          this._extractMethod(node, source, symbols, className);
        } else {
          this._extractFunction(node, source, symbols);
        }
        // Walk body
        this._walkChildren(node, source, symbols, null);
        return;

      case 'class_definition':
        this._extractClass(node, source, symbols);
        this._walkClassBody(node, source, symbols);
        return;

      case 'import_statement':
      case 'import_from_statement':
        this._extractImport(node, source, symbols);
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

  _extractFunction(node, source, symbols) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nodeText(nameNode, source);
    const isAsync = nodeText(node, source).startsWith('async');
    const params = this._extractParams(node, source);

    symbols.push(createFunction({
      name,
      async: isAsync,
      generator: false, // Too complex to detect without walking body for `yield`
      params,
      location: locationFromNode(node),
    }));
  }

  _extractMethod(node, source, symbols, className) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nodeText(nameNode, source);
    const isAsync = nodeText(node, source).startsWith('async');
    const params = this._extractParams(node, source);
    const decorators = this._extractDecorators(node, source);
    const isStatic = decorators.includes('staticmethod') || decorators.includes('classmethod');

    symbols.push(createMethod({
      name,
      className,
      static: isStatic,
      async: isAsync,
      generator: false,
      params,
      decorators,
      location: locationFromNode(node),
    }));
  }

  _extractClass(node, source, symbols) {
    const name = this._classNameFromNode(node, source);
    
    let superClass = null;
    const superclassesNode = node.childForFieldName('superclasses');
    if (superclassesNode) {
      // superclasses is typically an `argument_list` in Python Tree-sitter
      const firstSuperNode = superclassesNode.namedChildren[0];
      if (firstSuperNode) superClass = nodeText(firstSuperNode, source);
    }

    symbols.push(createClass({
      name,
      superClass,
      location: locationFromNode(node),
    }));
  }

  _extractImport(node, source, symbols) {
    if (node.type === 'import_statement') {
      // import foo, bar.baz
      for (const child of node.namedChildren) {
        if (child.type === 'dotted_name' || child.type === 'aliased_import') {
          const nameNode = child.type === 'aliased_import' ? child.namedChildren[0] : child;
          const aliasNode = child.type === 'aliased_import' ? child.childForFieldName('alias') : null;
          
          const moduleName = nodeText(nameNode, source);
          const aliasName = aliasNode ? nodeText(aliasNode, source) : null;
          
          symbols.push(createImport({
            source: moduleName,
            specifiers: [{ name: moduleName, alias: aliasName, type: 'default' }],
            location: locationFromNode(node),
          }));
        }
      }
    } else if (node.type === 'import_from_statement') {
      // from foo import bar
      const moduleNameNode = node.childForFieldName('module_name');
      // could be relative e.g., 'from . import foo'
      const moduleName = moduleNameNode ? nodeText(moduleNameNode, source) : (nodeText(node, source).includes('from . ') ? '.' : ''); 
      
      const specifiers = [];
      for (const child of node.namedChildren) {
        if (child.type === 'dotted_name' && child !== moduleNameNode) {
          specifiers.push({ name: nodeText(child, source), alias: null, type: 'named' });
        } else if (child.type === 'aliased_import') {
          const nameNode = child.namedChildren[0];
          const aliasNode = child.childForFieldName('alias');
          specifiers.push({
            name: nodeText(nameNode, source),
            alias: aliasNode ? nodeText(aliasNode, source) : null,
            type: 'named'
          });
        }
      }

      // Handle wildcard 'from foo import *'
      if (specifiers.length === 0 && nodeText(node, source).includes('*')) {
          specifiers.push({ name: '*', alias: null, type: 'namespace' });
      }

      symbols.push(createImport({
        source: moduleName,
        specifiers,
        location: locationFromNode(node),
      }));
    }
  }

  _extractParams(node, source) {
    const params = [];
    const paramsNode = node.childForFieldName('parameters');
    if (paramsNode) {
      for (const p of paramsNode.namedChildren) {
        if (p.type === 'identifier') {
          params.push(nodeText(p, source));
        } else if (p.type === 'default_parameter' || p.type === 'typed_parameter') {
            const nameNode = p.namedChildren[0];
            if (nameNode && nameNode.type === 'identifier') {
                params.push(nodeText(nameNode, source));
            } else {
                params.push('_');
            }
        } else if (p.type === 'typed_default_parameter') {
            const nameNode = p.childForFieldName('name') || p.namedChildren[0];
            if (nameNode && nameNode.type === 'identifier') {
                params.push(nodeText(nameNode, source));
            } else {
                params.push('_');
            }
        } else {
          params.push('_');
        }
      }
    }
    return params;
  }

  _extractDecorators(node, source) {
    const decorators = [];
    for (let i = 0; i < node.childCount; i++) {
        if (node.child(i).type === 'decorator') {
            const name = node.child(i).namedChildren[0];
            if (name) decorators.push(nodeText(name, source));
        }
    }
    return decorators;
  }

  _classNameFromNode(node, source) {
    const nameNode = node.childForFieldName('name');
    return nameNode ? nodeText(nameNode, source) : '<anonymous>';
  }
}

function nodeText(node, source) {
  return source.slice(node.startIndex, node.endIndex);
}

module.exports = { PythonParser };
