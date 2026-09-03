/**
 * tests/analyzers/commonJsRequire.test.js
 *
 * Focused tests for CommonJS require() extraction in JavaScriptParser.
 * Verifies that require() calls produce ImportSymbol objects with the
 * correct specifier type ('cjs-default' or 'cjs-named') so that the
 * dependency graph can distinguish them from ES module imports.
 */

'use strict';

import { getParser } from '@/services/analyzer/parsing/parser.registry.js';
import { JavaScriptParser } from '@/services/analyzer/parsing/languages/javascript.parser.js';
import { SymbolKind } from '@/services/analyzer/parsing/symbols.js';

// ── Setup ─────────────────────────────────────────────────────────────────────

let jsParser;

beforeAll(async () => {
  const tsParser = await getParser('javascript');
  jsParser = new JavaScriptParser(tsParser);
});

function parse(source) {
  return jsParser.parseFile(source, 'test.js');
}

function getImports(source) {
  return parse(source).symbols.filter(s => s.kind === SymbolKind.IMPORT);
}

// ── Basic require() ───────────────────────────────────────────────────────────

describe('CommonJS require — basic forms', () => {
  test('const x = require("../../analyzers/module") produces an import symbol', () => {
    const imports = getImports(`const db = require('./db');`);
    expect(imports).toHaveLength(1);
    expect(imports[0].source).toBe('./db');
  });

  test('var x = require("../../analyzers/module") produces an import symbol', () => {
    const imports = getImports(`var db = require('./db');`);
    expect(imports).toHaveLength(1);
    expect(imports[0].source).toBe('./db');
  });

  test('let x = require("../../analyzers/module") produces an import symbol', () => {
    const imports = getImports(`let db = require('./db');`);
    expect(imports).toHaveLength(1);
    expect(imports[0].source).toBe('./db');
  });

  test('double-quoted specifier is stripped', () => {
    const imports = getImports(`const x = require("express");`);
    expect(imports[0].source).toBe('express');
  });
});

// ── Specifier type — cjs-default ──────────────────────────────────────────────

describe('CommonJS require — cjs-default specifier', () => {
  test('whole-module require produces cjs-default specifier', () => {
    const imports = getImports(`const express = require('express');`);
    expect(imports).toHaveLength(1);
    expect(imports[0].specifiers).toHaveLength(1);
    expect(imports[0].specifiers[0].type).toBe('cjs-default');
    expect(imports[0].specifiers[0].name).toBe('express');
  });

  test('relative require produces cjs-default specifier', () => {
    const imports = getImports(`const User = require('../../analyzers/models/User');`);
    expect(imports[0].specifiers[0]).toMatchObject({
      name: 'User',
      alias: null,
      type: 'cjs-default',
    });
  });

  test('internal path require produces cjs-default', () => {
    const imports = getImports(`const router = require('../../routes/auth');`);
    expect(imports[0].specifiers[0].type).toBe('cjs-default');
  });
});

// ── Specifier type — cjs-named (destructured) ─────────────────────────────────

describe('CommonJS require — cjs-named specifier (destructured)', () => {
  test('single destructured import produces cjs-named specifier', () => {
    const imports = getImports(`const { Router } = require('express');`);
    expect(imports).toHaveLength(1);
    expect(imports[0].specifiers[0]).toMatchObject({
      name:  'Router',
      alias: null,
      type:  'cjs-named',
    });
  });

  test('multiple destructured names produce multiple cjs-named specifiers', () => {
    const imports = getImports(`const { Router, json, urlencoded } = require('express');`);
    expect(imports[0].specifiers).toHaveLength(3);
    expect(imports[0].specifiers.every(s => s.type === 'cjs-named')).toBe(true);
    expect(imports[0].specifiers.map(s => s.name)).toEqual(
      expect.arrayContaining(['Router', 'json', 'urlencoded'])
    );
  });

  test('renamed destructure sets alias', () => {
    const imports = getImports(`const { readFile: rf } = require('fs');`);
    const spec = imports[0].specifiers[0];
    expect(spec.name).toBe('readFile');
    expect(spec.alias).toBe('rf');
    expect(spec.type).toBe('cjs-named');
  });
});

// ── External vs relative require ──────────────────────────────────────────────

describe('CommonJS require — external vs relative', () => {
  test('external package require has bare specifier', () => {
    const imports = getImports(`const mongoose = require('mongoose');`);
    expect(imports[0].source).toBe('mongoose');
    // Not starting with ./ or ../
    expect(imports[0].source).not.toMatch(/^\./);
  });

  test('relative require has ./ prefix', () => {
    const imports = getImports(`const utils = require('./utils');`);
    expect(imports[0].source).toBe('./utils');
  });

  test('parent directory require has ../ prefix', () => {
    const imports = getImports(`const config = require('../config');`);
    expect(imports[0].source).toBe('../config');
  });
});

// ── Multiple requires ─────────────────────────────────────────────────────────

describe('CommonJS require — multiple requires in same file', () => {
  test('multiple require() calls all produce import symbols', () => {
    const src = `
      const express = require('express');
      const mongoose = require('mongoose');
      const User = require('./models/User');
      const { Router } = require('express');
    `;
    const imports = getImports(src);
    expect(imports).toHaveLength(4);
    expect(imports.map(i => i.source)).toEqual(
      expect.arrayContaining(['express', 'mongoose', './models/User'])
    );
  });

  test('mix of ES import and CJS require produces all imports', () => {
    const src = `
      import path from 'path';
      const express = require('express');
    `;
    const imports = getImports(src);
    expect(imports).toHaveLength(2);
    const esImport  = imports.find(i => i.source === 'path');
    const cjsImport = imports.find(i => i.source === 'express');
    expect(esImport.specifiers[0].type).toBe('default');
    expect(cjsImport.specifiers[0].type).toBe('cjs-default');
  });
});

// ── member access after require ───────────────────────────────────────────────

describe('CommonJS require — member access on require result', () => {
  test('require("x").something is still extracted', () => {
    // const Server = require('http').Server
    // The parser handles member_expression over require call
    const imports = getImports(`const Server = require('http').Server;`);
    expect(imports).toHaveLength(1);
    expect(imports[0].source).toBe('http');
  });
});

// ── Location ──────────────────────────────────────────────────────────────────

describe('CommonJS require — location', () => {
  test('location is set on require import', () => {
    const imports = getImports(`const x = require('../../analyzers/foo');`);
    expect(imports[0].location).toBeDefined();
    expect(imports[0].location.startLine).toBe(1);
  });

  test('location reflects correct line for multi-line file', () => {
    const src = `const a = 1;\nconst b = require('../../analyzers/foo');`;
    const imports = getImports(src);
    expect(imports[0].location.startLine).toBe(2);
  });
});

// ── Non-require calls are not extracted ───────────────────────────────────────

describe('CommonJS require — non-require calls not extracted', () => {
  test('import() dynamic import is not extracted as require', () => {
    const src = `const mod = import('./foo');`;
    const imports = getImports(src);
    // dynamic import() is a different AST node type — should not produce a symbol
    expect(imports).toHaveLength(0);
  });

  test('plain function call named differently is not extracted', () => {
    const imports = getImports(`const x = notRequire('./foo');`);
    expect(imports).toHaveLength(0);
  });
});

// ── Dependency graph integration: CJS edge type ───────────────────────────────

describe('CommonJS require — integration with dependency graph', () => {
  test('require() import becomes a "requires" edge in the graph', async () => {
    const {
      buildDependencyGraph,
    } = await import('@/services/analyzer/dependencies/dependency.analyzer.js');

    const analysis = {
      files: [
        {
          filePath: 'src/server.js',
          symbols: [{
            kind: 'import',
            source: './app',
            specifiers: [{ name: 'app', alias: null, type: 'cjs-default' }],
            location: null,
          }],
        },
        { filePath: 'src/app.js', symbols: [] },
      ],
    };

    const graph = buildDependencyGraph(analysis);
    const edge = graph.edges.find(
      e => e.source === 'file:src/server.js' && e.target === 'file:src/app.js'
    );
    expect(edge).toBeDefined();
    expect(edge.type).toBe('requires');
  });

  test('ES import becomes an "imports" edge in the graph', async () => {
    const {
      buildDependencyGraph,
    } = await import('@/services/analyzer/dependencies/dependency.analyzer.js');

    const analysis = {
      files: [
        {
          filePath: 'src/index.js',
          symbols: [{
            kind: 'import',
            source: './app',
            specifiers: [{ name: 'app', alias: null, type: 'default' }],
            location: null,
          }],
        },
        { filePath: 'src/app.js', symbols: [] },
      ],
    };

    const graph = buildDependencyGraph(analysis);
    const edge = graph.edges.find(
      e => e.source === 'file:src/index.js' && e.target === 'file:src/app.js'
    );
    expect(edge).toBeDefined();
    expect(edge.type).toBe('imports');
  });
});
