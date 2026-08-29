/**
 * symbols.js
 *
 * Canonical internal data model for all symbols extracted from source files.
 *
 * This module contains only factory functions and constants — no parsing
 * logic.  It is the single source of truth for what every symbol looks like
 * in memory.  Both the parsers (JavaScript, TypeScript) and any future
 * consumer (dependency graph, AI context builder, etc.) depend on this
 * module rather than on each other.
 *
 * ── Symbol types ──────────────────────────────────────────────────────────────
 *
 *   function      — named function declaration:  function foo() {}
 *   arrow         — arrow function assigned to a variable: const foo = () => {}
 *   class         — class declaration or expression
 *   method        — method inside a class body
 *   import        — import statement (ES module or CommonJS require)
 *   export        — export statement (named, default, re-export)
 *
 * ── Location ──────────────────────────────────────────────────────────────────
 *
 *   All symbols carry a `location` object with:
 *     startLine   (1-based)
 *     startColumn (0-based)
 *     endLine     (1-based)
 *     endColumn   (0-based)
 *
 *   tree-sitter uses 0-based rows; we convert to 1-based lines on extraction
 *   so that line numbers match what developers see in editors.
 */

'use strict';

// ── Symbol type constants ─────────────────────────────────────────────────────

const SymbolKind = Object.freeze({
  FUNCTION: 'function',
  ARROW:    'arrow',
  CLASS:    'class',
  METHOD:   'method',
  IMPORT:   'import',
  EXPORT:   'export',
});

// ── Location factory ──────────────────────────────────────────────────────────

/**
 * Creates a Location object from a tree-sitter node.
 * Converts tree-sitter's 0-based row to 1-based line numbers.
 *
 * @param {object} node  — tree-sitter SyntaxNode
 * @returns {Location}
 */
function locationFromNode(node) {
  return {
    startLine:   node.startPosition.row + 1,
    startColumn: node.startPosition.column,
    endLine:     node.endPosition.row + 1,
    endColumn:   node.endPosition.column,
  };
}

// ── Symbol factories ──────────────────────────────────────────────────────────

/**
 * FunctionSymbol
 *
 * Represents a named function declaration.
 *
 * Fields:
 *   kind       {string}   always 'function'
 *   name       {string}   function name
 *   async      {boolean}  true if declared with async keyword
 *   generator  {boolean}  true if declared with * (generator function)
 *   params     {string[]} parameter names (best-effort; complex patterns become '_')
 *   location   {Location}
 *
 * @param {object} opts
 * @returns {FunctionSymbol}
 *
 * @example
 *   { kind:'function', name:'greet', async:false, generator:false,
 *     params:['name'], location:{ startLine:3, startColumn:0, endLine:5, endColumn:1 } }
 */
function createFunction({ name, async: isAsync = false, generator = false, params = [], location }) {
  return { kind: SymbolKind.FUNCTION, name, async: isAsync, generator, params, location };
}

/**
 * ArrowSymbol
 *
 * Represents an arrow function assigned to a variable:
 *   const greet = (name) => { ... }
 *   export const add = (a, b) => a + b;
 *
 * Fields:
 *   kind       {string}   always 'arrow'
 *   name       {string}   name of the variable being assigned to
 *   async      {boolean}
 *   params     {string[]}
 *   location   {Location}
 *
 * @param {object} opts
 * @returns {ArrowSymbol}
 */
function createArrow({ name, async: isAsync = false, params = [], location }) {
  return { kind: SymbolKind.ARROW, name, async: isAsync, params, location };
}

/**
 * ClassSymbol
 *
 * Fields:
 *   kind        {string}    always 'class'
 *   name        {string}    class name (or '<anonymous>' for anonymous classes)
 *   superClass  {string|null}  name of extended class, or null
 *   location    {Location}
 *
 * @param {object} opts
 * @returns {ClassSymbol}
 */
function createClass({ name, superClass = null, location }) {
  return { kind: SymbolKind.CLASS, name, superClass, location };
}

/**
 * MethodSymbol
 *
 * A method inside a class body.
 *
 * Fields:
 *   kind        {string}   always 'method'
 *   name        {string}   method name
 *   className   {string}   name of the containing class
 *   static      {boolean}  true for static methods
 *   async       {boolean}
 *   generator   {boolean}
 *   visibility  {string}   'public' | 'private' | 'protected' (TS only; default 'public')
 *   params      {string[]}
 *   location    {Location}
 *
 * @param {object} opts
 * @returns {MethodSymbol}
 */
function createMethod({ name, className, static: isStatic = false, async: isAsync = false,
                        generator = false, visibility = 'public', params = [], location }) {
  return { kind: SymbolKind.METHOD, name, className, static: isStatic,
           async: isAsync, generator, visibility, params, location };
}

/**
 * ImportSymbol
 *
 * Represents an import statement.
 *
 * Fields:
 *   kind         {string}    always 'import'
 *   source       {string}    module specifier, e.g. './auth', 'express'
 *   specifiers   {ImportSpecifier[]}
 *     Each specifier: { name: string, alias: string|null, type: 'default'|'named'|'namespace'|'side-effect' }
 *   location     {Location}
 *
 * @example
 *   import fs from 'fs'
 *   → specifiers: [{ name:'fs', alias:null, type:'default' }]
 *
 *   import { readFile as rf, writeFile } from 'fs'
 *   → specifiers: [
 *       { name:'readFile', alias:'rf', type:'named' },
 *       { name:'writeFile', alias:null, type:'named' },
 *     ]
 *
 *   import * as path from 'path'
 *   → specifiers: [{ name:'path', alias:null, type:'namespace' }]
 *
 *   import 'dotenv/config'
 *   → specifiers: [{ name:'dotenv/config', alias:null, type:'side-effect' }]
 *
 * @param {object} opts
 * @returns {ImportSymbol}
 */
function createImport({ source, specifiers = [], location }) {
  return { kind: SymbolKind.IMPORT, source, specifiers, location };
}

/**
 * ExportSymbol
 *
 * Fields:
 *   kind      {string}         always 'export'
 *   exportType {string}        'named' | 'default' | 'reexport'
 *   name      {string|null}    exported name (null for default exports of expressions)
 *   source    {string|null}    source module for re-exports, e.g. './utils'
 *   location  {Location}
 *
 * @example
 *   export function greet() {}
 *   → { exportType:'named', name:'greet', source:null }
 *
 *   export default greet
 *   → { exportType:'default', name:'greet', source:null }
 *
 *   export { foo, bar } from './utils'
 *   → { exportType:'reexport', name:'foo', source:'./utils' }
 *      { exportType:'reexport', name:'bar', source:'./utils' }
 *
 * @param {object} opts
 * @returns {ExportSymbol}
 */
function createExport({ exportType, name = null, source = null, location }) {
  return { kind: SymbolKind.EXPORT, exportType, name, source, location };
}

// ── FileAnalysis factory ──────────────────────────────────────────────────────

/**
 * FileAnalysis
 *
 * The complete analysis result for a single source file.
 *
 * Fields:
 *   filePath    {string}     relative path within the repository
 *   language    {string}     detected language, e.g. 'javascript'
 *   symbols     {Symbol[]}   all extracted symbols in source order
 *   hasErrors   {boolean}    true if the tree-sitter parse produced errors
 *                            (file was still analysed as best-effort)
 *   error       {string|null} non-null only if analysis was completely aborted
 *                             (e.g. file read failed, unrecoverable parse crash)
 *   analyzedAt  {string}     ISO timestamp
 *
 * @param {object} opts
 * @returns {FileAnalysis}
 */
function createFileAnalysis({ filePath, language, symbols = [], hasErrors = false, error = null }) {
  return {
    filePath,
    language,
    symbols,
    hasErrors,
    error,
    analyzedAt: new Date().toISOString(),
  };
}

module.exports = {
  SymbolKind,
  locationFromNode,
  createFunction,
  createArrow,
  createClass,
  createMethod,
  createImport,
  createExport,
  createFileAnalysis,
};
