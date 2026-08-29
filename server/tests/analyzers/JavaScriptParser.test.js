/**
 * tests/analyzers/JavaScriptParser.test.js
 *
 * Comprehensive tests for JavaScript symbol extraction.
 * Each test follows the pattern: parse source → assert specific symbols.
 */

'use strict';

const { getParser }         = require('../../src/analyzers/parserRegistry');
const { JavaScriptParser }  = require('../../src/analyzers/JavaScriptParser');
const { SymbolKind }        = require('../../src/analyzers/symbols');

// ── Test fixture helpers ──────────────────────────────────────────────────────

let jsParser;

beforeAll(async () => {
  const tsParser = await getParser('javascript');
  jsParser = new JavaScriptParser(tsParser);
});

/**
 * Parse `source` and return all symbols of the given kind.
 */
function parse(source) {
  return jsParser.parseFile(source, 'test.js');
}

function symbolsOfKind(source, kind) {
  const result = parse(source);
  return result.symbols.filter(s => s.kind === kind);
}

function findSymbol(source, kind, name) {
  return symbolsOfKind(source, kind).find(s => s.name === name);
}

// ── Function declarations ─────────────────────────────────────────────────────

describe('JavaScriptParser — function declarations', () => {
  test('basic function declaration', () => {
    const sym = findSymbol('function greet(name) {}', SymbolKind.FUNCTION, 'greet');
    expect(sym).toBeDefined();
    expect(sym.async).toBe(false);
    expect(sym.generator).toBe(false);
    expect(sym.params).toEqual(['name']);
  });

  test('async function declaration', () => {
    const sym = findSymbol('async function fetchData(url, opts) {}', SymbolKind.FUNCTION, 'fetchData');
    expect(sym).toBeDefined();
    expect(sym.async).toBe(true);
    expect(sym.params).toEqual(['url', 'opts']);
  });

  test('generator function declaration', () => {
    const sym = findSymbol('function* gen() { yield 1; }', SymbolKind.FUNCTION, 'gen');
    expect(sym).toBeDefined();
    expect(sym.generator).toBe(true);
  });

  test('function with no params', () => {
    const sym = findSymbol('function init() {}', SymbolKind.FUNCTION, 'init');
    expect(sym).toBeDefined();
    expect(sym.params).toEqual([]);
  });

  test('function with default parameter', () => {
    const sym = findSymbol('function greet(name = "World") {}', SymbolKind.FUNCTION, 'greet');
    expect(sym).toBeDefined();
    expect(sym.params).toEqual(['name']);
  });

  test('function with rest parameter', () => {
    const sym = findSymbol('function sum(...args) {}', SymbolKind.FUNCTION, 'sum');
    expect(sym).toBeDefined();
    expect(sym.params).toEqual(['...args']);
  });

  test('function with destructured parameter becomes _', () => {
    const sym = findSymbol('function fn({ a, b }) {}', SymbolKind.FUNCTION, 'fn');
    expect(sym).toBeDefined();
    expect(sym.params).toEqual(['_']);
  });

  test('multiple function declarations', () => {
    const src = `
      function foo() {}
      function bar(x) { return x; }
    `;
    const fns = symbolsOfKind(src, SymbolKind.FUNCTION);
    expect(fns.map(f => f.name)).toContain('foo');
    expect(fns.map(f => f.name)).toContain('bar');
  });

  test('location is set correctly', () => {
    const src = `function greet(name) {\n  return name;\n}`;
    const sym = findSymbol(src, SymbolKind.FUNCTION, 'greet');
    expect(sym.location.startLine).toBe(1);
    expect(sym.location.startColumn).toBe(0);
    expect(sym.location.endLine).toBe(3);
  });
});

// ── Arrow functions ───────────────────────────────────────────────────────────

describe('JavaScriptParser — arrow functions', () => {
  test('const arrow function', () => {
    const sym = findSymbol('const greet = (name) => name;', SymbolKind.ARROW, 'greet');
    expect(sym).toBeDefined();
    expect(sym.async).toBe(false);
    expect(sym.params).toEqual(['name']);
  });

  test('let arrow function', () => {
    const sym = findSymbol('let add = (a, b) => a + b;', SymbolKind.ARROW, 'add');
    expect(sym).toBeDefined();
    expect(sym.params).toEqual(['a', 'b']);
  });

  test('async arrow function', () => {
    const sym = findSymbol('const fetchUser = async (id) => { return id; };', SymbolKind.ARROW, 'fetchUser');
    expect(sym).toBeDefined();
    expect(sym.async).toBe(true);
  });

  test('arrow function with no params', () => {
    const sym = findSymbol('const noop = () => {};', SymbolKind.ARROW, 'noop');
    expect(sym).toBeDefined();
    expect(sym.params).toEqual([]);
  });

  test('arrow function body expression (no braces)', () => {
    const sym = findSymbol('const double = x => x * 2;', SymbolKind.ARROW, 'double');
    expect(sym).toBeDefined();
    expect(sym.params).toEqual(['x']);
  });
});

// ── Classes ───────────────────────────────────────────────────────────────────

describe('JavaScriptParser — classes', () => {
  test('basic class declaration', () => {
    const sym = findSymbol('class Animal {}', SymbolKind.CLASS, 'Animal');
    expect(sym).toBeDefined();
    expect(sym.superClass).toBeNull();
  });

  test('class with extends', () => {
    const sym = findSymbol('class Dog extends Animal {}', SymbolKind.CLASS, 'Dog');
    expect(sym).toBeDefined();
    expect(sym.superClass).toBe('Animal');
  });

  test('location is set on class', () => {
    const sym = findSymbol('class Foo {}', SymbolKind.CLASS, 'Foo');
    expect(sym.location.startLine).toBe(1);
  });
});

// ── Class methods ─────────────────────────────────────────────────────────────

describe('JavaScriptParser — class methods', () => {
  const classSource = `
    class Animal {
      constructor(name) { this.name = name; }
      speak() { return this.name; }
      static create(name) { return new Animal(name); }
      async fetchData() {}
    }
  `;

  test('constructor is extracted as method', () => {
    const sym = findSymbol(classSource, SymbolKind.METHOD, 'constructor');
    expect(sym).toBeDefined();
    expect(sym.className).toBe('Animal');
    expect(sym.params).toEqual(['name']);
  });

  test('instance method', () => {
    const sym = findSymbol(classSource, SymbolKind.METHOD, 'speak');
    expect(sym).toBeDefined();
    expect(sym.className).toBe('Animal');
    expect(sym.static).toBe(false);
  });

  test('static method', () => {
    const sym = findSymbol(classSource, SymbolKind.METHOD, 'create');
    expect(sym).toBeDefined();
    expect(sym.static).toBe(true);
  });

  test('async method', () => {
    const sym = findSymbol(classSource, SymbolKind.METHOD, 'fetchData');
    expect(sym).toBeDefined();
    expect(sym.async).toBe(true);
  });
});

// ── Imports ───────────────────────────────────────────────────────────────────

describe('JavaScriptParser — imports', () => {
  test('default import', () => {
    const sym = findSymbol("import fs from 'fs';", SymbolKind.IMPORT, undefined);
    const imports = symbolsOfKind("import fs from 'fs';", SymbolKind.IMPORT);
    expect(imports).toHaveLength(1);
    expect(imports[0].source).toBe('fs');
    expect(imports[0].specifiers[0]).toMatchObject({ name: 'fs', alias: null, type: 'default' });
  });

  test('named imports', () => {
    const src = "import { readFile, writeFile } from 'fs';";
    const imports = symbolsOfKind(src, SymbolKind.IMPORT);
    expect(imports[0].specifiers).toHaveLength(2);
    expect(imports[0].specifiers[0]).toMatchObject({ name: 'readFile', alias: null, type: 'named' });
    expect(imports[0].specifiers[1]).toMatchObject({ name: 'writeFile', alias: null, type: 'named' });
  });

  test('named import with alias', () => {
    const src = "import { readFile as rf } from 'fs';";
    const imports = symbolsOfKind(src, SymbolKind.IMPORT);
    expect(imports[0].specifiers[0]).toMatchObject({ name: 'readFile', alias: 'rf', type: 'named' });
  });

  test('namespace import', () => {
    const src = "import * as path from 'path';";
    const imports = symbolsOfKind(src, SymbolKind.IMPORT);
    expect(imports[0].specifiers[0]).toMatchObject({ name: 'path', alias: null, type: 'namespace' });
  });

  test('side-effect import', () => {
    const src = "import 'dotenv/config';";
    const imports = symbolsOfKind(src, SymbolKind.IMPORT);
    expect(imports[0].specifiers[0].type).toBe('side-effect');
    expect(imports[0].source).toBe('dotenv/config');
  });

  test('relative import', () => {
    const src = "import { auth } from './middleware/auth';";
    const imports = symbolsOfKind(src, SymbolKind.IMPORT);
    expect(imports[0].source).toBe('./middleware/auth');
  });

  test('multiple imports', () => {
    const src = `
      import fs from 'fs';
      import path from 'path';
      import { Router } from 'express';
    `;
    const imports = symbolsOfKind(src, SymbolKind.IMPORT);
    expect(imports).toHaveLength(3);
    expect(imports.map(i => i.source)).toEqual(['fs', 'path', 'express']);
  });
});

// ── Exports ───────────────────────────────────────────────────────────────────

describe('JavaScriptParser — exports', () => {
  test('named export — function declaration', () => {
    const src = 'export function greet(name) {}';
    const exports = symbolsOfKind(src, SymbolKind.EXPORT);
    expect(exports.some(e => e.exportType === 'named' && e.name === 'greet')).toBe(true);
  });

  test('named export — const', () => {
    const src = 'export const PI = 3.14;';
    const exports = symbolsOfKind(src, SymbolKind.EXPORT);
    expect(exports.some(e => e.exportType === 'named' && e.name === 'PI')).toBe(true);
  });

  test('default export — identifier', () => {
    const src = 'function greet() {}\nexport default greet;';
    const exports = symbolsOfKind(src, SymbolKind.EXPORT);
    expect(exports.some(e => e.exportType === 'default' && e.name === 'greet')).toBe(true);
  });

  test('default export — function expression', () => {
    const src = 'export default function() {}';
    const exports = symbolsOfKind(src, SymbolKind.EXPORT);
    expect(exports.some(e => e.exportType === 'default')).toBe(true);
  });

  test('named export — export clause', () => {
    const src = 'const a = 1, b = 2;\nexport { a, b };';
    const exports = symbolsOfKind(src, SymbolKind.EXPORT);
    expect(exports.some(e => e.name === 'a')).toBe(true);
    expect(exports.some(e => e.name === 'b')).toBe(true);
  });

  test('re-export from another module', () => {
    const src = "export { foo, bar } from './utils';";
    const exports = symbolsOfKind(src, SymbolKind.EXPORT);
    expect(exports.some(e => e.exportType === 'reexport' && e.name === 'foo' && e.source === './utils')).toBe(true);
    expect(exports.some(e => e.exportType === 'reexport' && e.name === 'bar')).toBe(true);
  });

  test('export class', () => {
    const src = 'export class Foo {}';
    const exports = symbolsOfKind(src, SymbolKind.EXPORT);
    expect(exports.some(e => e.name === 'Foo')).toBe(true);
  });

  test('module.exports = object', () => {
    const src = 'module.exports = { foo, bar };';
    const exports = symbolsOfKind(src, SymbolKind.EXPORT);
    expect(exports.some(e => e.name === 'foo')).toBe(true);
    expect(exports.some(e => e.name === 'bar')).toBe(true);
  });

  test('module.exports = identifier', () => {
    const src = 'function Router() {}\nmodule.exports = Router;';
    const exports = symbolsOfKind(src, SymbolKind.EXPORT);
    expect(exports.some(e => e.exportType === 'default' && e.name === 'Router')).toBe(true);
  });
});

// ── Nested functions ──────────────────────────────────────────────────────────

describe('JavaScriptParser — nested functions', () => {
  test('nested function inside function body', () => {
    const src = `
      function outer() {
        function inner() {}
      }
    `;
    const fns = symbolsOfKind(src, SymbolKind.FUNCTION);
    expect(fns.map(f => f.name)).toContain('outer');
    expect(fns.map(f => f.name)).toContain('inner');
  });

  test('arrow function inside function body', () => {
    const src = `
      function outer() {
        const helper = (x) => x * 2;
      }
    `;
    const result = parse(src);
    expect(result.symbols.some(s => s.name === 'outer')).toBe(true);
    expect(result.symbols.some(s => s.name === 'helper' && s.kind === SymbolKind.ARROW)).toBe(true);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('JavaScriptParser — edge cases', () => {
  test('empty file returns empty symbols', () => {
    const result = parse('');
    expect(result.symbols).toHaveLength(0);
    expect(result.error).toBeNull();
  });

  test('whitespace-only file returns empty symbols', () => {
    const result = parse('   \n\n\t  ');
    expect(result.symbols).toHaveLength(0);
    expect(result.error).toBeNull();
  });

  test('malformed JavaScript does not throw', () => {
    const result = parse('function broken( { if (');
    expect(() => result).not.toThrow();
    expect(result).toBeDefined();
    expect(result.hasErrors).toBe(true);
  });

  test('syntax error does not prevent extraction of other symbols', () => {
    // Tree-sitter is error-tolerant — it still produces a partial AST
    const src = 'function ok() {}\n const x = ;';
    const result = parse(src);
    // ok() should still be found even if the assignment is malformed
    expect(result.symbols.some(s => s.name === 'ok')).toBe(true);
    expect(result.hasErrors).toBe(true);
  });

  test('fileAnalysis has correct shape', () => {
    const result = parse('function foo() {}');
    expect(result).toMatchObject({
      filePath: 'test.js',
      language: 'javascript',
      hasErrors: false,
      error: null,
      analyzedAt: expect.any(String),
      symbols: expect.any(Array),
    });
  });

  test('complex real-world snippet', () => {
    const src = `
      import express from 'express';
      import { Router } from 'express';
      import path from 'path';

      const router = Router();

      const handler = async (req, res) => {
        res.send('ok');
      };

      class UserController {
        constructor(db) { this.db = db; }
        async getUser(id) { return this.db.find(id); }
        static create(db) { return new UserController(db); }
      }

      export { router, UserController };
      module.exports = { handler };
    `;
    const result = parse(src);
    expect(result.hasErrors).toBe(false);
    expect(result.symbols.some(s => s.kind === SymbolKind.IMPORT && s.source === 'express')).toBe(true);
    expect(result.symbols.some(s => s.kind === SymbolKind.ARROW && s.name === 'handler')).toBe(true);
    expect(result.symbols.some(s => s.kind === SymbolKind.CLASS && s.name === 'UserController')).toBe(true);
    expect(result.symbols.some(s => s.kind === SymbolKind.METHOD && s.name === 'getUser')).toBe(true);
    expect(result.symbols.some(s => s.kind === SymbolKind.METHOD && s.static === true)).toBe(true);
  });
});
