/**
 * tests/analyzers/TypeScriptParser.test.js
 *
 * Tests for TypeScript-specific symbol extraction.
 * Covers everything in JavaScriptParser plus TS-specific constructs.
 */

'use strict';

import { getParser } from '@/services/analyzer/parsing/parser.registry';
import { TypeScriptParser } from '@/services/analyzer/parsing/languages/typescript.parser.js';
import { SymbolKind } from '@/services/analyzer/parsing/symbols';

let tsParser;

beforeAll(async () => {
  const rawParser = await getParser('typescript');
  tsParser = new TypeScriptParser(rawParser);
});

function parse(source) {
  return tsParser.parseFile(source, 'test.ts');
}

function symbolsOfKind(source, kind) {
  return parse(source).symbols.filter(s => s.kind === kind);
}

function findSymbol(source, kind, name) {
  return symbolsOfKind(source, kind).find(s => s.name === name);
}

// ── TypeScript functions ──────────────────────────────────────────────────────

describe('TypeScriptParser — functions', () => {
  test('typed function declaration', () => {
    const sym = findSymbol('function greet(name: string): string { return name; }', SymbolKind.FUNCTION, 'greet');
    expect(sym).toBeDefined();
    expect(sym.params).toEqual(['name']);
  });

  test('async typed function', () => {
    const sym = findSymbol('async function fetchUser(id: number): Promise<User> { }', SymbolKind.FUNCTION, 'fetchUser');
    expect(sym).toBeDefined();
    expect(sym.async).toBe(true);
  });

  test('generic function', () => {
    const sym = findSymbol('function identity<T>(x: T): T { return x; }', SymbolKind.FUNCTION, 'identity');
    expect(sym).toBeDefined();
  });

  test('typed arrow function', () => {
    const sym = findSymbol('const greet = (name: string): string => name;', SymbolKind.ARROW, 'greet');
    expect(sym).toBeDefined();
    expect(sym.params).toEqual(['name']);
  });
});

// ── TypeScript classes ────────────────────────────────────────────────────────

describe('TypeScriptParser — classes', () => {
  test('basic TypeScript class', () => {
    const sym = findSymbol('class UserService {}', SymbolKind.CLASS, 'UserService');
    expect(sym).toBeDefined();
  });

  test('class with implements', () => {
    const src = 'class UserService implements IService { }';
    const sym = findSymbol(src, SymbolKind.CLASS, 'UserService');
    expect(sym).toBeDefined();
  });

  test('abstract class', () => {
    const src = 'abstract class BaseRepo { }';
    const sym = findSymbol(src, SymbolKind.CLASS, 'BaseRepo');
    expect(sym).toBeDefined();
  });

  test('class with typed constructor', () => {
    const src = `
      class UserService {
        constructor(private db: Database) {}
      }
    `;
    const method = findSymbol(src, SymbolKind.METHOD, 'constructor');
    expect(method).toBeDefined();
    expect(method.className).toBe('UserService');
  });

  test('class with access modifiers on methods', () => {
    const src = `
      class Repo {
        public find(id: number) {}
        private _connect() {}
        protected validate(x: any) {}
      }
    `;
    const pub = findSymbol(src, SymbolKind.METHOD, 'find');
    expect(pub).toBeDefined();
    expect(pub.visibility).toBe('public');

    const priv = findSymbol(src, SymbolKind.METHOD, '_connect');
    expect(priv).toBeDefined();
    expect(priv.visibility).toBe('private');

    const prot = findSymbol(src, SymbolKind.METHOD, 'validate');
    expect(prot).toBeDefined();
    expect(prot.visibility).toBe('protected');
  });

  test('static method in TS class', () => {
    const src = `
      class Factory {
        static create(): Factory { return new Factory(); }
      }
    `;
    const sym = findSymbol(src, SymbolKind.METHOD, 'create');
    expect(sym).toBeDefined();
    expect(sym.static).toBe(true);
  });
});

// ── TypeScript interfaces ─────────────────────────────────────────────────────

describe('TypeScriptParser — interfaces', () => {
  test('simple interface', () => {
    const src = 'interface User { id: number; name: string; }';
    const classes = symbolsOfKind(src, SymbolKind.CLASS);
    const iface = classes.find(c => c.name === 'User');
    expect(iface).toBeDefined();
    expect(iface.tsKind).toBe('interface');
  });

  test('interface with extends', () => {
    const src = 'interface AdminUser extends User { role: string; }';
    const classes = symbolsOfKind(src, SymbolKind.CLASS);
    const iface = classes.find(c => c.name === 'AdminUser');
    expect(iface).toBeDefined();
    expect(iface.tsKind).toBe('interface');
  });

  test('multiple interfaces', () => {
    const src = `
      interface IRepo { findById(id: number): any; }
      interface IService { process(): void; }
    `;
    const classes = symbolsOfKind(src, SymbolKind.CLASS);
    const ifaceNames = classes.filter(c => c.tsKind === 'interface').map(c => c.name);
    expect(ifaceNames).toContain('IRepo');
    expect(ifaceNames).toContain('IService');
  });
});

// ── TypeScript type aliases ───────────────────────────────────────────────────

describe('TypeScriptParser — type aliases', () => {
  test('simple type alias', () => {
    const src = 'type UserId = string;';
    const fns = symbolsOfKind(src, SymbolKind.FUNCTION);
    const typeAlias = fns.find(f => f.name === 'UserId');
    expect(typeAlias).toBeDefined();
    expect(typeAlias.tsKind).toBe('type');
  });

  test('complex type alias', () => {
    const src = 'type Handler = (req: Request, res: Response) => void;';
    const fns = symbolsOfKind(src, SymbolKind.FUNCTION);
    const typeAlias = fns.find(f => f.name === 'Handler');
    expect(typeAlias).toBeDefined();
    expect(typeAlias.tsKind).toBe('type');
  });
});

// ── TypeScript imports & exports ──────────────────────────────────────────────

describe('TypeScriptParser — imports and exports', () => {
  test('typed import', () => {
    const src = "import { Router, Request, Response } from 'express';";
    const imports = symbolsOfKind(src, SymbolKind.IMPORT);
    expect(imports[0].source).toBe('express');
    expect(imports[0].specifiers).toHaveLength(3);
  });

  test('type import (TypeScript)', () => {
    const src = "import type { User } from './models/User';";
    const imports = symbolsOfKind(src, SymbolKind.IMPORT);
    // The parser still captures the import source regardless of 'type' keyword
    expect(imports.length).toBeGreaterThan(0);
    expect(imports[0].source).toBe('./models/User');
  });

  test('default export in TypeScript', () => {
    const src = 'export default class UserService {}';
    const exports = symbolsOfKind(src, SymbolKind.EXPORT);
    expect(exports.some(e => e.exportType === 'default')).toBe(true);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('TypeScriptParser — edge cases', () => {
  test('empty TypeScript file', () => {
    const result = parse('');
    expect(result.symbols).toHaveLength(0);
    expect(result.error).toBeNull();
  });

  test('malformed TypeScript does not throw', () => {
    const result = parse('class Broken { constructor( { if }');
    expect(() => result).not.toThrow();
    expect(result).toBeDefined();
    expect(result.hasErrors).toBe(true);
  });

  test('TypeScript with decorators does not crash', () => {
    // Decorators are not explicitly extracted but should not crash the parser
    const src = `
      @Injectable()
      class Service {
        @Inject() private dep: Dep;
        run(): void {}
      }
    `;
    const result = parse(src);
    expect(result).toBeDefined();
    // class should still be found
    expect(result.symbols.some(s => s.kind === SymbolKind.CLASS && s.name === 'Service')).toBe(true);
  });

  test('complex TypeScript module', () => {
    const src = `
      import { Injectable } from '@angular/core';
      import type { User } from '../../../analyzers/models';

      export interface UserRepository {
        findById(id: string): Promise<User>;
      }

      export type UserId = string;

      @Injectable()
      export class UserService implements UserRepository {
        constructor(private readonly db: Database) {}

        async findById(id: UserId): Promise<User> {
          return this.db.query(id);
        }

        private formatUser(user: User): User {
          return user;
        }
      }

      export default UserService;
    `;
    const result = parse(src);
    expect(result.hasErrors).toBe(false);
    expect(result.symbols.some(s => s.kind === SymbolKind.IMPORT)).toBe(true);
    expect(result.symbols.some(s => s.kind === SymbolKind.CLASS && s.name === 'UserRepository' && s.tsKind === 'interface')).toBe(true);
    expect(result.symbols.some(s => s.kind === SymbolKind.FUNCTION && s.name === 'UserId' && s.tsKind === 'type')).toBe(true);
    expect(result.symbols.some(s => s.kind === SymbolKind.CLASS && s.name === 'UserService')).toBe(true);
    expect(result.symbols.some(s => s.kind === SymbolKind.METHOD && s.name === 'findById')).toBe(true);
    expect(result.symbols.some(s => s.kind === SymbolKind.METHOD && s.name === 'formatUser' && s.visibility === 'private')).toBe(true);
    expect(result.symbols.some(s => s.kind === SymbolKind.EXPORT && s.exportType === 'default')).toBe(true);
  });

  test('fileAnalysis has correct language field', () => {
    const result = parse('const x: number = 1;');
    expect(result.language).toBe('typescript');
  });
});
