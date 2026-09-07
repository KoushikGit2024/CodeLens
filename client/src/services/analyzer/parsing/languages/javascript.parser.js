/**
 * JavaScriptParser.js
 *
 * It initializes the Tree-sitter parser, then extracts symbols from JavaScript/JSX code, 
 * and then it applies the canonical schemas to build intelligence models.
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
 * How this file is structured:
 *   1. extractSymbols()           — It receives the root, then extracts all symbols, and then it applies the array output.
 *   2. extractAdvancedFindings()  — It defines syntax queries, then extracts SAST/Test features, and then it applies the AnalysisFinding schema.
 *   3. _walk()                    — It traverses the tree, then extracts node types, and then it applies the specific dispatchers.
 */

import { 
  locationFromNode, createFunction, createArrow, createClass, 
  createMethod, createImport, createExport, SymbolKind 
} from '../symbols';
import { BaseParser } from './base.parser.js';
import { calculateComplexity } from '../../advanced/complexity.analyzer.js';
import { generateStructuralHash } from '../../advanced/clone.analyzer.js';

export class JavaScriptParser extends BaseParser {
  constructor(tsParser) {
    super(tsParser, 'javascript');
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

    // It defines the dangerous sink query, then extracts the matching AST nodes, and then it applies the critical security finding schema.
    const sinkQuery = `
      (call_expression function: (identifier) @func (#match? @func "^(eval|setTimeout|setInterval|exec)$"))
    `;
    findings.push(...this.extractFindings(
      rootNode, sinkQuery, filePath, 'security', 'DANGEROUS_SINK', 'security', 'critical',
      'Dangerous sink detected: {text}',
      'The function `{text}` can lead to remote code execution if provided with unsanitized user input.'
    ));

    // It defines the test block query, then extracts the test suite nodes, and then it applies the architectural info schema.
    const testQuery = `
      (call_expression function: (identifier) @test_func (#match? @test_func "^(describe|it|test)$"))
    `;
    findings.push(...this.extractFindings(
      rootNode, testQuery, filePath, 'architecture', 'TEST_BLOCK', 'reliability', 'info',
      'Test Suite / Case found',
      'Identified test block: {text}'
    ));

    // It defines the floating promise query, then extracts unhandled promise chains, and then it applies the reliability warning schema.
    const floatingPromiseQuery = `
      (expression_statement (call_expression function: (member_expression property: (property_identifier) @prop (#match? @prop "^(then|catch)$")))) @floating
    `;
    findings.push(...this.extractFindings(
      rootNode, floatingPromiseQuery, filePath, 'hygiene', 'FLOATING_PROMISE', 'reliability', 'warning',
      'Floating Promise Chain',
      'This promise chain is neither awaited nor returned, which may lead to unhandled rejections.'
    ));

    return findings;
  }

  // ── AST walker ──────────────────────────────────────────────────────────────

  /**
   * It inspects the current node type, then extracts the specific language construct, 
   * and then it applies the correct extraction method or walks the children.
   */
  _walk(node, source, symbols, className) {
    switch (node.type) {
      case 'function_declaration':
      case 'generator_function_declaration':
        this._extractFunction(node, source, symbols);
        // It identifies the function body, then extracts nested nodes, and then it applies the walk function recursively.
        this._walkChildren(node, source, symbols, null);
        return;

      case 'class_declaration':
      case 'class':
        this._extractClass(node, source, symbols);
        // It captures the class name context, then extracts the body nodes, and then it applies the parent identity to nested methods.
        this._walkClassBody(node, source, symbols);
        return;

      case 'method_definition':
        if (className) {
          this._extractMethod(node, source, symbols, className);
        }
        // It enters the method body, then extracts inner declarations, and then it applies the recursive child walk.
        this._walkChildren(node, source, symbols, null);
        return;

      case 'lexical_declaration':
      case 'variable_declaration':
        this._extractArrowFromDeclaration(node, source, symbols);
        this._extractCommonJsRequire(node, source, symbols);
        this._walkChildren(node, source, symbols, className);
        return;

      case 'export_statement':
        this._extractExport(node, source, symbols);
        // It evaluates the exported wrapper, then extracts the inner functions/classes, and then it applies the standard child walk.
        this._walkChildren(node, source, symbols, className);
        return;

      case 'import_statement':
        this._extractImport(node, source, symbols);
        return;

      case 'expression_statement':
        // It detects expression statements, then extracts CommonJS export patterns, and then it applies them to the symbol list.
        this._extractCommonJsExport(node, source, symbols);
        this._walkChildren(node, source, symbols, className);
        return;

      default:
        this._walkChildren(node, source, symbols, className);
    }
  }

  /**
   * It iterates over the child count, then extracts each child node, and then it applies the main walk switch.
   */
  _walkChildren(node, source, symbols, className) {
    for (let i = 0; i < node.childCount; i++) {
      this._walk(node.child(i), source, symbols, className);
    }
  }

  /**
   * It locates the class body, then extracts the method nodes, and then it applies the enclosing class name to the traversal.
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
   * It validates the function name node, then extracts the async/generator modifiers, 
   * and then it applies the function factory to populate the symbol array.
   */
  _extractFunction(node, source, symbols) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name       = nodeText(nameNode, source);
    const isAsync    = nodeHasChild(node, 'async');
    const isGen      = node.type === 'generator_function_declaration';
    const params     = this._extractParams(node, source);
    const complexity = calculateComplexity(node);
    const hash       = generateStructuralHash(node);

    symbols.push(createFunction({
      name,
      async: isAsync,
      generator: isGen,
      params,
      complexity,
      hash,
      location: locationFromNode(node),
    }));
  }

  /**
   * It filters for variable declarators, then extracts the arrow function value, 
   * and then it applies the arrow symbol factory.
   */
  _extractArrowFromDeclaration(node, source, symbols) {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type !== 'variable_declarator') continue;

      const valueNode = child.childForFieldName('value');
      if (!valueNode || valueNode.type !== 'arrow_function') continue;

      const nameNode = child.childForFieldName('name');
      if (!nameNode) continue;

      const name       = nodeText(nameNode, source);
      const isAsync    = nodeHasChild(valueNode, 'async');
      const params     = this._extractParams(valueNode, source);
      const complexity = calculateComplexity(valueNode);
      const hash       = generateStructuralHash(valueNode);

      symbols.push(createArrow({
        name,
        async: isAsync,
        params,
        complexity,
        hash,
        location: locationFromNode(child),
      }));
    }
  }

  /**
   * It parses the class identifier, then extracts the heritage/superclass if present, 
   * and then it applies the class factory configuration.
   */
  _extractClass(node, source, symbols) {
    const name = this._classNameFromNode(node, source);

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
   * It reads the method name field, then extracts static/async modifiers, 
   * and then it applies the method factory while linking the parent class.
   */
  _extractMethod(node, source, symbols, className) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name       = nodeText(nameNode, source);
    const isStatic   = nodeHasChild(node, 'static');
    const isAsync    = nodeHasChild(node, 'async');
    const isGen      = nodeHasChild(node, '*');
    const params     = this._extractParams(node, source);
    const complexity = calculateComplexity(node);
    const hash       = generateStructuralHash(node);

    symbols.push(createMethod({
      name,
      className,
      static: isStatic,
      async: isAsync,
      generator: isGen,
      params,
      complexity,
      hash,
      location: locationFromNode(node),
    }));
  }

  /**
   * It isolates the import source, then extracts the specifier clauses, 
   * and then it applies them to construct a unified ES module import symbol.
   */
  _extractImport(node, source, symbols) {
    const sourceNode = node.childForFieldName('source');
    if (!sourceNode) return;

    const moduleSource = stripQuotes(nodeText(sourceNode, source));
    const specifiers   = [];

    const child1 = node.child(1);
    const clauseNode = (child1 && child1.type === 'import_clause') ? child1 : null;

    if (!clauseNode) {
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

  /**
   * It iterates through the import clause, then extracts named/namespace/default identifiers, 
   * and then it applies them to the specifier array passed by reference.
   */
  _walkImportClause(clauseNode, source, specifiers) {
    for (let i = 0; i < clauseNode.childCount; i++) {
      const child = clauseNode.child(i);

      if (child.type === 'identifier') {
        specifiers.push({ name: nodeText(child, source), alias: null, type: 'default' });

      } else if (child.type === 'namespace_import') {
        const idNode = child.namedChildren.find(n => n.type === 'identifier');
        if (idNode) specifiers.push({ name: nodeText(idNode, source), alias: null, type: 'namespace' });

      } else if (child.type === 'named_imports') {
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
   * It evaluates the export wrapper, then extracts the declaration or default value, 
   * and then it applies the export factory for tracking modular boundaries.
   */
  _extractExport(node, source, symbols) {
    const isDefault = nodeHasNamedChild(node, 'export_clause') === false
                   && this._nodeChildText(node, source).startsWith('export default');

    const sourceNode = node.childForFieldName('source');
    const reexportSource = sourceNode ? stripQuotes(nodeText(sourceNode, source)) : null;

    if (this._hasDirectChild(node, 'default')) {
      const valueNode = node.childForFieldName('value') || node.childForFieldName('declaration');
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

    if (reexportSource) {
      symbols.push(createExport({
        exportType: 'reexport',
        name: '*',
        source: reexportSource,
        location: locationFromNode(node),
      }));
      return;
    }

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
   * It scans variable declarators, then extracts the require() call arguments, 
   * and then it applies the data into standard ImportSymbols to unify ESM and CJS dependencies.
   */
  _extractCommonJsRequire(node, source, symbols) {
    for (let i = 0; i < node.childCount; i++) {
      const declarator = node.child(i);
      if (declarator.type !== 'variable_declarator') continue;

      const valueNode = declarator.childForFieldName('value');
      if (!valueNode) continue;

      const callNode = _findRequireCall(valueNode, source);
      if (!callNode) continue;

      const argsNode = callNode.childForFieldName('arguments');
      if (!argsNode) continue;
      
      const firstArg = argsNode.namedChildren[0];
      if (!firstArg || (firstArg.type !== 'string' && firstArg.type !== 'template_string')) continue;

      const moduleSource = stripQuotes(nodeText(firstArg, source));
      const location     = locationFromNode(declarator);
      const specifiers   = [];

      const nameNode = declarator.childForFieldName('name');
      if (!nameNode) continue;

      if (nameNode.type === 'identifier') {
        specifiers.push({
          name:  nodeText(nameNode, source),
          alias: null,
          type:  'cjs-default',
        });
      } else if (nameNode.type === 'object_pattern') {
        for (const prop of nameNode.namedChildren) {
          if (prop.type === 'shorthand_property_identifier_pattern') {
            specifiers.push({
              name:  nodeText(prop, source),
              alias: null,
              type:  'cjs-named',
            });
          } else if (prop.type === 'pair_pattern') {
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
        source: moduleSource,
        specifiers,
        location,
      }));
    }
  }

  /**
   * It checks for assignment expressions, then extracts the module.exports prefix, 
   * and then it applies the right-hand object properties to the export tracking.
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
   * It evaluates function-like nodes, then extracts the parameter identifiers, 
   * and then it applies fallback underscores for complex destructuring logic.
   */
  _extractParams(fnNode, source) {
    const paramsNode = fnNode.childForFieldName('parameters');
    if (paramsNode) {
      return this._extractFromFormalParams(paramsNode, source);
    }

    const singleParam = fnNode.childForFieldName('parameter');
    if (singleParam) {
      if (singleParam.type === 'identifier') {
        return [nodeText(singleParam, source)];
      }
      return ['_'];
    }

    return [];
  }

  /**
   * It loops through formal parameters, then extracts valid argument names or rest patterns, 
   * and then it applies them to the output parameter list.
   */
  _extractFromFormalParams(paramsNode, source) {
    const params = [];
    for (const p of paramsNode.namedChildren) {
      switch (p.type) {
        case 'identifier':
          params.push(nodeText(p, source));
          break;
        case 'required_parameter':
        case 'optional_parameter': {
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

  /**
   * It finds the class name node, then extracts the text content, and then it applies '<anonymous>' as a fallback.
   */
  _classNameFromNode(node, source) {
    const nameNode = node.childForFieldName('name');
    return nameNode ? nodeText(nameNode, source) : '<anonymous>';
  }

  /**
   * It safely checks the node text, then extracts it via error catching, and then it applies a blank string on failure.
   */
  _nodeChildText(node, source) {
    try { return nodeText(node, source); } catch { return ''; }
  }

  /**
   * It loops through child nodes, then extracts their type properties, and then it applies a boolean check for a match.
   */
  _hasDirectChild(node, type) {
    for (let i = 0; i < node.childCount; i++) {
      if (node.child(i).type === type) return true;
    }
    return false;
  }

  /**
   * It queries the child array, then extracts the first child matching the desired type, and then it applies the node reference to the caller.
   */
  _findNamedChild(node, type) {
    for (let i = 0; i < node.childCount; i++) {
      const c = node.child(i);
      if (c.type === type) return c;
    }
    return null;
  }

  /**
   * It checks for standard name fields, then extracts declarator identifiers if missing, 
   * and then it applies them to the exported names array.
   */
  _namesFromDeclaration(declNode, source) {
    const names = [];
    const nameNode = declNode.childForFieldName('name');
    if (nameNode) {
      names.push(nodeText(nameNode, source));
      return names;
    }
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
 * It identifies the byte boundaries, then extracts the string slice, and then it applies it as a textual representation.
 */
function nodeText(node, source) {
  return source.slice(node.startIndex, node.endIndex);
}

/**
 * It iterates through all children, then extracts the node type, and then it applies a true condition if it matches.
 */
function nodeHasChild(node, type) {
  for (let i = 0; i < node.childCount; i++) {
    if (node.child(i).type === type) return true;
  }
  return false;
}

/**
 * It scans the named children array, then extracts their types, and then it applies the array `some` condition.
 */
function nodeHasNamedChild(node, type) {
  return node.namedChildren.some(c => c.type === type);
}

/**
 * It evaluates the raw string literal, then extracts the boundary quote characters, and then it applies a regex replacement.
 */
function stripQuotes(str) {
  return str.replace(/^['"`]|['"`]$/g, '');
}

/**
 * It examines a value node, then extracts nested require function calls, and then it applies recursion for member expressions.
 */
function _findRequireCall(node, source) {
  if (node.type === 'call_expression') {
    const fn = node.childForFieldName('function');
    if (fn && fn.type === 'identifier' && nodeText(fn, source) === 'require') {
      return node;
    }
  }
  if (node.type === 'member_expression') {
    const obj = node.childForFieldName('object');
    if (obj) return _findRequireCall(obj, source);
  }
  return null;
}