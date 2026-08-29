/**
 * tests/analyzers/languageDetector.test.js
 */

'use strict';

const { detectLanguage, supportedExtensions } = require('../../src/analyzers/languageDetector');

describe('languageDetector', () => {
  describe('detectLanguage', () => {
    test.each([
      ['index.js',      'javascript'],
      ['app.mjs',       'javascript'],
      ['config.cjs',    'javascript'],
      ['component.jsx', 'javascript'],
      ['app.ts',        'typescript'],
      ['component.tsx', 'typescript'],
      ['config.mts',    'typescript'],
      ['config.cts',    'typescript'],
    ])('%s → %s', (filename, expected) => {
      expect(detectLanguage(filename)).toBe(expected);
    });

    test.each([
      ['README.md'],
      ['package.json'],
      ['style.css'],
      ['image.png'],
      ['binary.exe'],
      ['noextension'],
      ['.env'],
    ])('%s → null', (filename) => {
      expect(detectLanguage(filename)).toBeNull();
    });

    test('works with full paths', () => {
      expect(detectLanguage('/project/src/utils/helpers.ts')).toBe('typescript');
      expect(detectLanguage('C:\\project\\src\\app.js')).toBe('javascript');
    });

    test('extension matching is case-insensitive', () => {
      expect(detectLanguage('App.JS')).toBe('javascript');
      expect(detectLanguage('Main.TS')).toBe('typescript');
    });
  });

  describe('supportedExtensions', () => {
    test('returns a Set containing .js and .ts', () => {
      const exts = supportedExtensions();
      expect(exts.has('.js')).toBe(true);
      expect(exts.has('.ts')).toBe(true);
    });
  });
});
