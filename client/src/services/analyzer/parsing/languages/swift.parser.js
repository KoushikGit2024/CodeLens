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
} from '../symbols.js';
import { calculateComplexity } from '../../advanced/complexity.analyzer.js';
import { generateStructuralHash } from '../../advanced/clone.analyzer.js';

export class SwiftParser extends BaseParser {
  constructor(tsParser) {
    super(tsParser, 'swift');
  }

  extractSymbols(rootNode, source) {
    const symbols = [];
    this._walk(rootNode, source, symbols, null);
    return symbols;
  }

  extractUsages(rootNode, source) {
    const usages = new Set();
    this._walkUsages(rootNode, source, usages);
    return Array.from(usages);
  }

  _walkUsages(node, source, usages) {
    if (node.type === 'identifier' || node.type === 'type_identifier') {
      const text = this._nodeText(node, source);
      if (text && /^[A-Z]/.test(text)) {
        usages.add(text);
      }
    }
    for (let i = 0; i < node.childCount; i++) {
      this._walkUsages(node.child(i), source, usages);
    }
  }

  _nodeText(node, source) {
    return source.substring(node.startIndex, node.endIndex);
  }

  extractAdvancedFindings(rootNode, filePath) {
    const findings = [];

    // Detect unsafe or dangerous functions like unsafeBitCast
    const unsafeQuery = `(call_expression (identifier) @func (#match? @func "^(unsafeBitCast|fatalError)$"))`;
    findings.push(
      ...this.extractFindings(
        rootNode,
        unsafeQuery,
        filePath,
        'security',
        'UNSAFE_SWIFT_OPERATION',
        'security',
        'warning',
        'Dangerous/Unsafe Operation Detected',
        'Usage of `{text}` detected. Use with caution as it can cause crashes or memory unsafety.'
      )
    );

    // Detect test blocks (XCTest)
    const testQuery = `(function_declaration name: (identifier) @func (#match? @func "^test"))`;
    findings.push(
      ...this.extractFindings(
        rootNode,
        testQuery,
        filePath,
        'architecture',
        'TEST_BLOCK',
        'reliability',
        'info',
        'Swift XCTest Function',
        'Test function identified: {text}'
      )
    );

    return findings;
  }

  _walk(node, source, symbols, className) {
    switch (node.type) {
      case 'import_declaration':
        this._extractImport(node, source, symbols);
        return;
      case 'class_declaration':
        this._extractClass(node, source, symbols);
        this._walkChildren(node, source, symbols, this._nameOf(node, source));
        return;
      case 'struct_declaration':
        this._extractStruct(node, source, symbols);
        this._walkChildren(node, source, symbols, this._nameOf(node, source));
        return;
      case 'protocol_declaration':
        this._extractProtocol(node, source, symbols);
        this._walkChildren(node, source, symbols, this._nameOf(node, source));
        return;
      case 'function_declaration':
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

  _nameOf(node, source) {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'identifier' || child.type === 'type_identifier') {
        return nodeText(child, source);
      }
    }
    return null;
  }

  _extractImport(node, source, symbols) {
    const text = nodeText(node, source);
    const parts = text.split(' ').filter(p => p.trim());
    if (parts.length >= 2) {
      symbols.push(
        createImport({
          source: parts[parts.length - 1],
          specifiers: [],
          location: locationFromNode(node),
        })
      );
    }
  }

  _extractClass(node, source, symbols) {
    const name = this._nameOf(node, source);
    if (!name) return;
    symbols.push(createClass({ name, location: locationFromNode(node) }));
  }

  _extractStruct(node, source, symbols) {
    const name = this._nameOf(node, source);
    if (!name) return;
    symbols.push(createStruct({ name, location: locationFromNode(node) }));
  }

  _extractProtocol(node, source, symbols) {
    const name = this._nameOf(node, source);
    if (!name) return;
    symbols.push(createInterface({ name, location: locationFromNode(node) }));
  }

  _extractFunctionOrMethod(node, source, symbols, className) {
    const name = this._nameOf(node, source);
    if (!name) return;

    const complexity = calculateComplexity(node);
    const hash = generateStructuralHash(node);

    // Extract parameters
    const params = [];
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'parameter_clause' || child.type === 'parameter_list') {
        for (let j = 0; j < child.childCount; j++) {
          const p = child.child(j);
          if (p.type === 'parameter') {
            // In swift, parameter has a name or external name
            let pName = nodeText(p, source).split(':')[0].trim();
            params.push(pName);
          }
        }
      }
    }

    // Check modifiers for 'static' or 'class'
    let isStatic = false;
    let visibility = 'public';
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'modifiers') {
        const mods = nodeText(child, source).toLowerCase();
        if (mods.includes('static') || mods.includes('class')) isStatic = true;
        if (mods.includes('private')) visibility = 'private';
        if (mods.includes('internal')) visibility = 'internal';
      }
    }

    const isAsync = nodeText(node, source).includes('async');

    if (className) {
      symbols.push(
        createMethod({
          name,
          className,
          static: isStatic,
          visibility,
          async: isAsync,
          generator: false,
          params,
          complexity,
          hash,
          location: locationFromNode(node),
        })
      );
    } else {
      symbols.push(
        createFunction({
          name,
          async: isAsync,
          generator: false,
          params,
          complexity,
          hash,
          location: locationFromNode(node),
        })
      );
    }
  }
}

function nodeText(node, source) {
  return source.slice(node.startIndex, node.endIndex);
}
