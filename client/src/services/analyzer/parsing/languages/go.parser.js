/**
 * GoParser.js
 *
 * It initializes the Go Tree-sitter parser, then extracts structural packages and functions,
 * and then it applies the canonical schemas to build intelligence models.
 *
 * How this file is structured:
 *   1. extractSymbols()          — It initiates the tree walk, then extracts all symbols, and then it applies them to the output array.
 *   2. extractAdvancedFindings() — It defines Go syntax queries, then extracts matching AST nodes, and then it applies the AnalysisFinding schema.
 *   3. _walk()                   — It examines the node type, then extracts specific language constructs, and then it applies the target extraction logic.
 */

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
} from '../symbols.js';
import { calculateComplexity } from '../../advanced/complexity.analyzer.js';
import { generateStructuralHash } from '../../advanced/clone.analyzer.js';

export class GoParser extends BaseParser {
  constructor(tsParser) {
    super(tsParser, 'go');
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

    // It defines the command execution query, then extracts os/exec usages, and then it applies the critical security finding schema.
    const sinkQuery = `
      (call_expression function: (selector_expression operand: (identifier) @pkg field: (field_identifier) @fn) 
      (#eq? @pkg "exec") (#eq? @fn "Command")) @sink
    `;
    findings.push(
      ...this.extractFindings(
        rootNode,
        sinkQuery,
        filePath,
        'security',
        'OS_COMMAND_INJECTION',
        'security',
        'critical',
        'OS Command Execution',
        'Usage of `exec.Command` detected. Ensure all arguments are strictly sanitized to prevent command injection.'
      )
    );

    // It defines the Go test query, then extracts functions starting with Test, and then it applies the architectural info schema.
    const testQuery = `
      (function_declaration name: (identifier) @func (#match? @func "^Test"))
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
        'Go Test Function',
        'Test function identified: {text}'
      )
    );

    return findings;
  }

  // ── AST walker ──────────────────────────────────────────────────────────────

  /**
   * It evaluates the AST node type, then extracts Go-specific declarations,
   * and then it applies the appropriate factory dispatchers.
   */
  _walk(node, source, symbols, className) {
    switch (node.type) {
      case 'package_clause':
        this._extractPackage(node, source, symbols);
        return;

      case 'import_declaration':
        this._extractImport(node, source, symbols);
        return;

      case 'function_declaration':
        this._extractFunction(node, source, symbols);
        // It enters the function body, then extracts nested closures, and then it applies the recursive child walk.
        this._walkChildren(node, source, symbols, null);
        return;

      case 'method_declaration':
        this._extractMethod(node, source, symbols);
        this._walkChildren(node, source, symbols, null);
        return;

      case 'type_declaration':
        this._extractTypeDeclaration(node, source, symbols);
        return;

      default:
        this._walkChildren(node, source, symbols, className);
    }
  }

  /**
   * It iterates over the child nodes, then extracts each syntax child,
   * and then it applies the traversal switch.
   */
  _walkChildren(node, source, symbols, className) {
    for (let i = 0; i < node.childCount; i++) {
      this._walk(node.child(i), source, symbols, className);
    }
  }

  // ── Symbol extractors ────────────────────────────────────────────────────────

  /**
   * It inspects the package clause, then extracts the package identifier,
   * and then it applies the package symbol factory.
   */
  _extractPackage(node, source, symbols) {
    const nameNode = node.childForFieldName('package_identifier');
    if (nameNode) {
      symbols.push(
        createPackage({
          name: nodeText(nameNode, source),
          location: locationFromNode(node),
        })
      );
    }
  }

  /**
   * It evaluates the import declaration, then extracts the individual import specs,
   * and then it applies them to construct unified import symbols.
   */
  _extractImport(node, source, symbols) {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'import_spec' || child.type === 'import_spec_list') {
        if (child.type === 'import_spec_list') {
          for (let j = 0; j < child.childCount; j++) {
            const spec = child.child(j);
            if (spec.type === 'import_spec') {
              this._createImportFromSpec(spec, source, symbols);
            }
          }
        } else {
          this._createImportFromSpec(child, source, symbols);
        }
      }
    }
  }

  /**
   * It inspects the import spec, then extracts the package path and optional alias,
   * and then it applies the import symbol schema.
   */
  _createImportFromSpec(specNode, source, symbols) {
    const pathNode = specNode.childForFieldName('path');
    if (!pathNode) return;

    const moduleName = stripQuotes(nodeText(pathNode, source));
    const nameNode = specNode.childForFieldName('name');
    const alias = nameNode ? nodeText(nameNode, source) : null;

    // In Go, the actual imported package name is the last segment of the path if no alias is provided
    const importedName = alias ? alias : moduleName.split('/').pop();

    symbols.push(
      createImport({
        source: moduleName,
        specifiers: [{ name: importedName, alias: alias, type: 'default' }],
        location: locationFromNode(specNode),
      })
    );
  }

  /**
   * It parses the type declaration, then extracts the struct or interface specifications,
   * and then it applies the corresponding struct or interface factory.
   */
  _extractTypeDeclaration(node, source, symbols) {
    for (let i = 0; i < node.childCount; i++) {
      const spec = node.child(i);
      if (spec.type === 'type_spec') {
        const nameNode = spec.childForFieldName('name');
        const typeNode = spec.childForFieldName('type');

        if (!nameNode || !typeNode) continue;
        const name = nodeText(nameNode, source);

        if (typeNode.type === 'struct_type') {
          symbols.push(createStruct({ name, location: locationFromNode(spec) }));
        } else if (typeNode.type === 'interface_type') {
          symbols.push(createInterface({ name, location: locationFromNode(spec) }));
        } else {
          // Aliases or custom scalar types are modeled as classes for generic architectural tracking
          symbols.push(createClass({ name, superClass: null, location: locationFromNode(spec) }));
        }
      }
    }
  }

  /**
   * It targets the function declaration, then extracts the parameters and complexity,
   * and then it applies the function symbol schema.
   */
  _extractFunction(node, source, symbols) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nodeText(nameNode, source);
    const params = this._extractParams(node, source);
    const complexity = calculateComplexity(node);
    const hash = generateStructuralHash(node);

    symbols.push(
      createFunction({
        name,
        async: false,
        generator: false,
        params,
        complexity,
        hash,
        location: locationFromNode(node),
      })
    );
  }

  /**
   * It checks the method declaration, then extracts the receiver type to link the parent struct,
   * and then it applies the method symbol factory.
   */
  _extractMethod(node, source, symbols) {
    const nameNode = node.childForFieldName('name');
    const receiverNode = node.childForFieldName('receiver');
    if (!nameNode || !receiverNode) return;

    const name = nodeText(nameNode, source);
    let className = '<anonymous>';

    // Go receivers look like: (p *Person) or (p Person)
    const paramList = receiverNode.childForFieldName('parameters') || receiverNode;
    for (let i = 0; i < paramList.childCount; i++) {
      const p = paramList.child(i);
      if (p.type === 'parameter_declaration') {
        const typeNode = p.childForFieldName('type');
        if (typeNode) {
          // It checks for pointer types, then extracts the underlying identifier, and then it applies it to the className.
          if (typeNode.type === 'pointer_type') {
            className = nodeText(typeNode.child(1), source);
          } else {
            className = nodeText(typeNode, source);
          }
        }
      }
    }

    const params = this._extractParams(node, source);
    const complexity = calculateComplexity(node);
    const hash = generateStructuralHash(node);

    // Go methods are exported if they start with a capital letter
    const visibility = name[0] === name[0].toUpperCase() ? 'public' : 'private';

    symbols.push(
      createMethod({
        name,
        className,
        static: false,
        visibility,
        async: false,
        generator: false,
        params,
        complexity,
        hash,
        location: locationFromNode(node),
      })
    );
  }

  // ── Utilities ────────────────────────────────────────────────────────────────

  /**
   * It navigates the parameter list, then extracts the parameter names,
   * and then it applies them to the output array.
   */
  _extractParams(fnNode, source) {
    const params = [];
    const paramsNode = fnNode.childForFieldName('parameters');
    if (paramsNode) {
      for (let i = 0; i < paramsNode.childCount; i++) {
        const p = paramsNode.child(i);
        if (p.type === 'parameter_declaration') {
          const nameNode = p.childForFieldName('name');
          if (nameNode) {
            // It identifies comma-separated parameter groups, then extracts each name, and then it applies them to the list.
            if (nameNode.type === 'identifier_list') {
              for (let j = 0; j < nameNode.childCount; j++) {
                if (nameNode.child(j).type === 'identifier') {
                  params.push(nodeText(nameNode.child(j), source));
                }
              }
            } else {
              params.push(nodeText(nameNode, source));
            }
          } else {
            params.push('_');
          }
        }
      }
    }
    return params;
  }
}

// ── Module-level helpers ──────────────────────────────────────────────────────

/**
 * It isolates the byte indexes, then extracts the string slice,
 * and then it applies it as a textual representation.
 */
function nodeText(node, source) {
  return source.slice(node.startIndex, node.endIndex);
}

/**
 * It evaluates the raw string literal, then extracts the boundary quotes,
 * and then it applies a regex replacement.
 */
function stripQuotes(str) {
  return str.replace(/^['"`]|['"`]$/g, '');
}
