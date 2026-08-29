/**
 * tests/analyzers/KotlinParser.test.js
 *
 * Tests for Kotlin symbol extraction via the KotlinParser.
 * Each test follows the pattern: parse source → assert specific symbols.
 */

'use strict';

const { getParser }    = require('../../../../src/domains/parsing/parser.registry');
const { KotlinParser } = require('../../../../src/domains/parsing/languages/kotlin.parser');
const { SymbolKind }   = require('../../../../src/domains/parsing/symbols');

let ktParser;

beforeAll(async () => {
  const tsParser = await getParser('kotlin');
  ktParser = new KotlinParser(tsParser);
});

function parse(source) {
  return ktParser.parseFile(source, 'test.kt');
}

function symbolsOfKind(source, kind) {
  return parse(source).symbols.filter(s => s.kind === kind);
}

function findSymbol(source, kind, name) {
  return symbolsOfKind(source, kind).find(s => s.name === name);
}

// ── Package ───────────────────────────────────────────────────────────────────

describe('KotlinParser — package', () => {
  test('extracts package header', () => {
    const syms = symbolsOfKind('package com.example.app', SymbolKind.PACKAGE);
    expect(syms.length).toBeGreaterThanOrEqual(1);
    expect(syms[0].name).toContain('com.example.app');
  });
});

// ── Imports ───────────────────────────────────────────────────────────────────

describe('KotlinParser — imports', () => {
  test('extracts a regular import', () => {
    const syms = symbolsOfKind('import com.example.Foo', SymbolKind.IMPORT);
    expect(syms.length).toBe(1);
    expect(syms[0].source).toBe('com.example.Foo');
    expect(syms[0].specifiers[0].name).toBe('Foo');
  });

  test('extracts a wildcard import', () => {
    const source = 'import kotlinx.coroutines.*';
    const syms = symbolsOfKind(source, SymbolKind.IMPORT);
    expect(syms.length).toBe(1);
    expect(syms[0].source).toBe('kotlinx.coroutines');
    expect(syms[0].specifiers[0].name).toBe('*');
  });

  test('extracts multiple imports', () => {
    const source = `
import com.example.Foo
import com.example.Bar
import kotlin.collections.List
    `;
    const syms = symbolsOfKind(source, SymbolKind.IMPORT);
    expect(syms.length).toBe(3);
  });
});

// ── Classes ───────────────────────────────────────────────────────────────────

describe('KotlinParser — classes', () => {
  test('extracts a simple class', () => {
    const sym = findSymbol('class Foo {}', SymbolKind.CLASS, 'Foo');
    expect(sym).toBeDefined();
  });

  test('extracts data class', () => {
    const sym = findSymbol('data class User(val name: String, val age: Int)', SymbolKind.CLASS, 'User');
    expect(sym).toBeDefined();
  });

  test('extracts class with superclass', () => {
    const sym = findSymbol('class Dog : Animal()', SymbolKind.CLASS, 'Dog');
    expect(sym).toBeDefined();
    expect(sym.superClass).toBe('Animal');
  });

  test('extracts object declaration', () => {
    const sym = findSymbol('object Singleton {}', SymbolKind.CLASS, 'Singleton');
    expect(sym).toBeDefined();
  });
});

// ── Interfaces ────────────────────────────────────────────────────────────────

describe('KotlinParser — interfaces', () => {
  test('extracts an interface', () => {
    const sym = findSymbol('interface Printable {}', SymbolKind.INTERFACE, 'Printable');
    expect(sym).toBeDefined();
  });
});

// ── Functions ─────────────────────────────────────────────────────────────────

describe('KotlinParser — functions', () => {
  test('extracts a top-level function', () => {
    const sym = findSymbol('fun greet(name: String): String { return "Hello $name" }', SymbolKind.METHOD, 'greet');
    expect(sym).toBeDefined();
    expect(sym.params).toContain('name');
  });

  test('extracts a suspend function', () => {
    const sym = findSymbol('suspend fun fetchData(url: String) {}', SymbolKind.METHOD, 'fetchData');
    expect(sym).toBeDefined();
    expect(sym.async).toBe(true);
  });

  test('extracts member functions from a class', () => {
    const source = `
class Calculator {
    fun add(a: Int, b: Int): Int = a + b
    fun subtract(a: Int, b: Int): Int = a - b
}
    `;
    const syms = symbolsOfKind(source, SymbolKind.METHOD);
    const names = syms.map(s => s.name);
    expect(names).toContain('add');
    expect(names).toContain('subtract');
    expect(syms.find(s => s.name === 'add')?.className).toBe('Calculator');
  });
});

// ── Full file ─────────────────────────────────────────────────────────────────

describe('KotlinParser — full file', () => {
  test('parses a realistic Kotlin file', () => {
    const source = `
package com.example

import kotlinx.coroutines.Dispatchers
import com.example.model.User

interface Repository {
    fun findById(id: Int): User?
}

data class UserRepository(private val db: Database) : Repository {
    override fun findById(id: Int): User? {
        return db.query(id)
    }

    suspend fun findAll(): List<User> {
        return db.queryAll()
    }
}
    `;
    const result = parse(source);
    const kinds = new Set(result.symbols.map(s => s.kind));
    expect(kinds.has(SymbolKind.PACKAGE)).toBe(true);
    expect(kinds.has(SymbolKind.IMPORT)).toBe(true);
    expect(kinds.has(SymbolKind.INTERFACE)).toBe(true);
    expect(kinds.has(SymbolKind.CLASS)).toBe(true);
    expect(kinds.has(SymbolKind.METHOD)).toBe(true);
  });
});
