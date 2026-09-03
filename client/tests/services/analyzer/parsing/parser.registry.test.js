import { describe, it, expect, beforeAll } from 'vitest';
import { getParser, isSupported, supportedLanguages } from '../../../../src/services/analyzer/parsing/parser.registry';

// Note: Testing web-tree-sitter in Vitest (Node/JSDOM) can be tricky because
// it tries to fetch '/parsers/tree-sitter.wasm' which requires a server or mock.
// We'll write a basic test to ensure the module exports correctly.

describe('parser.registry (Frontend)', () => {
  it('should export supportedLanguages and isSupported', () => {
    const langs = supportedLanguages();
    expect(langs).toContain('javascript');
    expect(langs).toContain('python');
    
    expect(isSupported('javascript')).toBe(true);
    expect(isSupported('rust')).toBe(false);
  });

  // Full parsing test might require mocking fetch or using a Web Worker.
  // For now, we verify the structure is sound.
});
