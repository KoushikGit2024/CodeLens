/**
 * tests/analyzers/parserRegistry.test.js
 *
 * Tests for parserRegistry: ensures web-tree-sitter initialises correctly
 * and returns configured parsers for supported languages.
 */

'use strict';

const { getParser, isSupported, supportedLanguages } = require('../../src/analyzers/parserRegistry');

describe('parserRegistry', () => {
  test('isSupported returns true for javascript', () => {
    expect(isSupported('javascript')).toBe(true);
  });

  test('isSupported returns true for typescript', () => {
    expect(isSupported('typescript')).toBe(true);
  });

  test('isSupported returns false for unknown language', () => {
    expect(isSupported('cobol')).toBe(false);
  });

  test('supportedLanguages includes javascript and typescript', () => {
    const langs = supportedLanguages();
    expect(langs).toContain('javascript');
    expect(langs).toContain('typescript');
  });

  test('getParser returns a parser for javascript', async () => {
    const parser = await getParser('javascript');
    expect(parser).toBeDefined();
    // Verify it can actually parse something
    const tree = parser.parse('const x = 1;');
    expect(tree.rootNode.type).toBe('program');
    expect(tree.rootNode.hasError).toBe(false);
  });

  test('getParser returns a parser for typescript', async () => {
    const parser = await getParser('typescript');
    const tree = parser.parse('const x: number = 1;');
    expect(tree.rootNode.hasError).toBe(false);
  });

  test('getParser throws for unsupported language', async () => {
    await expect(getParser('brainfuck')).rejects.toThrow();
  });
});
