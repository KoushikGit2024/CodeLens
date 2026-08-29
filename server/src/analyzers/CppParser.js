/**
 * CppParser.js
 *
 * Extracts symbols from C++ source files using Tree-sitter.
 */

'use strict';

const { BaseParser } = require('./BaseParser');
const {
  locationFromNode,
  createClass,
  createMethod,
  createFunction,
  createImport,
  createStruct,
  createNamespace,
} = require('./symbols');

class CppParser extends BaseParser {
  constructor(tsParser) {
    super(tsParser, 'cpp');
  }

  extractSymbols(rootNode, source) {
    const symbols = [];
    this._walk(rootNode, source, symbols, null);
    return symbols;
  }

  _walk(node, source, symbols, className) {
    switch (node.type) {
      case 'preproc_include':
        this._extractInclude(node, source, symbols);
        return;

      case 'namespace_definition':
        this._extractNamespace(node, source, symbols);
        this._walkClassBody(node, source, symbols);
        return;

      case 'class_specifier':
        this._extractClass(node, source, symbols);
        this._walkClassBody(node, source, symbols);
        return;

      case 'struct_specifier':
        this._extractStruct(node, source, symbols);
        this._walkClassBody(node, source, symbols);
        return;

      case 'function_definition':
        // C++ methods often defined outside class like `void MyClass::myMethod()`
        // The declarator might be a `function_declarator` or `qualified_identifier`
        this._extractFunctionOrMethod(node, source, symbols, className);
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
    // C++ class/struct bodies are usually `field_declaration_list`
    const body = classNode.childForFieldName('body');
    if (!body) return;
    for (let i = 0; i < body.childCount; i++) {
      this._walk(body.child(i), source, symbols, name);
    }
  }

  _extractInclude(node, source, symbols) {
    const pathNode = node.childForFieldName('path');
    if (!pathNode) return;

    let rawPath = nodeText(pathNode, source);
    // Tree-sitter includes the quotes/brackets in the path string: <iostream> or "header.hpp"
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

  _extractNamespace(node, source, symbols) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    symbols.push(createNamespace({
      name: nodeText(nameNode, source),
      location: locationFromNode(node),
    }));
  }

  _extractClass(node, source, symbols) {
    const name = this._classNameFromNode(node, source);
    if (!name || name === '<anonymous>') return; // skip anon for simplicity

    symbols.push(createClass({
      name,
      superClass: null, // Multiple inheritance is complex to extract, skipping for now
      location: locationFromNode(node),
    }));
  }

  _extractStruct(node, source, symbols) {
    const name = this._classNameFromNode(node, source);
    if (!name || name === '<anonymous>') return;

    symbols.push(createStruct({
      name,
      location: locationFromNode(node),
    }));
  }

  _extractFunctionOrMethod(node, source, symbols, currentClassName) {
    const declarator = node.childForFieldName('declarator');
    if (!declarator) return;

    // To find the actual name, we may need to dig through pointers/references
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

    const params = this._extractParams(coreDeclarator, source);

    if (isMethod) {
        symbols.push(createMethod({
            name: fnName,
            className: className,
            static: false, // In C++ static is a decl-specifier on the declaration, hard to get from definition alone usually
            async: false,
            generator: false,
            params,
            location: locationFromNode(node),
        }));
    } else {
        symbols.push(createFunction({
            name: fnName,
            async: false,
            generator: false,
            params,
            location: locationFromNode(node),
        }));
    }
  }

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

  _classNameFromNode(node, source) {
    const nameNode = node.childForFieldName('name');
    return nameNode ? nodeText(nameNode, source) : '<anonymous>';
  }
}

function nodeText(node, source) {
  return source.slice(node.startIndex, node.endIndex);
}

module.exports = { CppParser };
