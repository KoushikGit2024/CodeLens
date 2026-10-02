/**
 * PythonParser.js
 *
 * It initializes the Python Tree-sitter parser, then extracts modular symbols,
 * and then it applies the canonical schemas to build intelligence structures.
 *
 * How this file is structured:
 *   1. extractSymbols()          — It receives the root node, then extracts the symbols via tree walk, and then it applies the array output.
 *   2. extractAdvancedFindings() — It defines Python syntax queries, then extracts matching test and security nodes, and then it applies the AnalysisFinding schema.
 *   3. _walk()                   — It checks the AST node type, then extracts Python-specific declarations, and then it applies the corresponding factory methods.
 */

import { BaseParser } from './base.parser.js';
import { locationFromNode, createImport, createClass, createMethod, createFunction } from '../symbols.js';
import { calculateComplexity } from '../../advanced/complexity.analyzer.js';
import { generateStructuralHash } from '../../advanced/clone.analyzer.js';

export class PythonParser extends BaseParser {
  constructor(tsParser) {
    super(tsParser, 'python');
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
      (call function: (identifier) @func (#match? @func "^(eval|exec|__import__|subprocess)$"))
    `;
    findings.push(
      ...this.extractFindings(
        rootNode,
        sinkQuery,
        filePath,
        'security',
        'DANGEROUS_SINK',
        'security',
        'critical',
        'Dangerous sink detected: {text}',
        'Avoid using `{text}` as it is highly vulnerable to injection attacks.'
      )
    );

    // It defines the test block query, then extracts the test function nodes, and then it applies the architectural info schema.
    const testQuery = `
      (function_definition name: (identifier) @func (#match? @func "^test_"))
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
        'Python UnitTest found',
        'Test function identified: {text}'
      )
    );

    return findings;
  }

  // ── AST walker ──────────────────────────────────────────────────────────────

  /**
   * It inspects the current node type, then extracts the specific language construct,
   * and then it applies the correct extraction method or walks the children.
   */
  _walk(node, source, symbols, className) {
    switch (node.type) {
      case 'function_definition':
        if (className) {
          this._extractMethod(node, source, symbols, className);
        } else {
          this._extractFunction(node, source, symbols);
        }
        // It identifies the function body, then extracts nested nodes, and then it applies the walk function recursively.
        this._walkChildren(node, source, symbols, null);
        return;

      case 'class_definition':
        this._extractClass(node, source, symbols);
        // It captures the class name context, then extracts the body nodes, and then it applies the parent identity to nested methods.
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
   * It validates the function name node, then extracts the parameters and complexity,
   * and then it applies the function factory to populate the symbol array.
   */
  _extractFunction(node, source, symbols) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nodeText(nameNode, source);
    const isAsync = nodeText(node, source).startsWith('async');
    const params = this._extractParams(node, source);
    const complexity = calculateComplexity(node);
    const hash = generateStructuralHash(node);

    symbols.push(
      createFunction({
        name,
        async: isAsync,
        generator: false, // Too complex to detect without walking body for `yield`
        params,
        complexity,
        hash,
        location: locationFromNode(node),
      })
    );
  }

  /**
   * It reads the method name field, then extracts decorators to resolve static modifiers,
   * and then it applies the method factory while linking the parent class.
   */
  _extractMethod(node, source, symbols, className) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nodeText(nameNode, source);
    const isAsync = nodeText(node, source).startsWith('async');
    const params = this._extractParams(node, source);
    const decorators = this._extractDecorators(node, source);
    const isStatic = decorators.includes('staticmethod') || decorators.includes('classmethod');
    const complexity = calculateComplexity(node);
    const hash = generateStructuralHash(node);

    symbols.push(
      createMethod({
        name,
        className,
        static: isStatic,
        async: isAsync,
        generator: false,
        params,
        decorators,
        complexity,
        hash,
        location: locationFromNode(node),
      })
    );
  }

  /**
   * It parses the class identifier, then extracts the heritage/superclasses if present,
   * and then it applies the class factory configuration.
   */
  _extractClass(node, source, symbols) {
    const name = this._classNameFromNode(node, source);

    let superClass = null;
    const superclassesNode = node.childForFieldName('superclasses');
    if (superclassesNode) {
      const firstSuperNode = superclassesNode.namedChildren[0];
      if (firstSuperNode) superClass = nodeText(firstSuperNode, source);
    }

    symbols.push(
      createClass({
        name,
        superClass,
        location: locationFromNode(node),
      })
    );
  }

  /**
   * It evaluates import statements, then extracts the module names and aliases,
   * and then it applies them to construct a unified import symbol format.
   */
  _extractImport(node, source, symbols) {
    if (node.type === 'import_statement') {
      for (const child of node.namedChildren) {
        if (child.type === 'dotted_name' || child.type === 'aliased_import') {
          const nameNode = child.type === 'aliased_import' ? child.namedChildren[0] : child;
          const aliasNode = child.type === 'aliased_import' ? child.childForFieldName('alias') : null;

          const moduleName = nodeText(nameNode, source);
          const aliasName = aliasNode ? nodeText(aliasNode, source) : null;

          symbols.push(
            createImport({
              source: moduleName,
              specifiers: [{ name: moduleName, alias: aliasName, type: 'default' }],
              location: locationFromNode(node),
            })
          );
        }
      }
    } else if (node.type === 'import_from_statement') {
      const moduleNameNode = node.childForFieldName('module_name');
      const moduleName = moduleNameNode
        ? nodeText(moduleNameNode, source)
        : nodeText(node, source).includes('from . ')
          ? '.'
          : '';

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
            type: 'named',
          });
        }
      }

      if (specifiers.length === 0 && nodeText(node, source).includes('*')) {
        specifiers.push({ name: '*', alias: null, type: 'namespace' });
      }

      symbols.push(
        createImport({
          source: moduleName,
          specifiers,
          location: locationFromNode(node),
        })
      );
    }
  }

  // ── Utilities ────────────────────────────────────────────────────────────────

  /**
   * It evaluates function-like nodes, then extracts the parameter identifiers,
   * and then it applies fallback underscores for complex typed or defaulted parameters.
   */
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

  /**
   * It checks for decorator annotations, then extracts the underlying identifier,
   * and then it applies them to the decorators tracking array.
   */
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

  /**
   * It accesses the class identifier, then extracts the raw text,
   * and then it applies a generic placeholder if absent.
   */
  _classNameFromNode(node, source) {
    const nameNode = node.childForFieldName('name');
    return nameNode ? nodeText(nameNode, source) : '<anonymous>';
  }
}

// ── Module-level helpers ──────────────────────────────────────────────────────

/**
 * It isolates the byte indexes, then extracts the string substring,
 * and then it applies it as a textual representation.
 */
function nodeText(node, source) {
  return source.slice(node.startIndex, node.endIndex);
}
