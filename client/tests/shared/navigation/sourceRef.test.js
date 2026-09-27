/**
 * sourceRef.test.js
 *
 * Unit tests for the canonical SourceReference model and URL builder.
 */
import { describe, it, expect } from 'vitest';
import {
  makeSourceRef,
  tryMakeSourceRef,
  buildSourceUrl,
  parseRefString,
} from '../../../src/shared/navigation/sourceRef.js';

// ── makeSourceRef ──────────────────────────────────────────────────────────────

describe('makeSourceRef', () => {
  it('creates a minimal ref with just a filePath', () => {
    const ref = makeSourceRef({ filePath: 'src/app.js' });
    expect(ref.filePath).toBe('src/app.js');
    expect(ref.startLine).toBeUndefined();
    expect(ref.endLine).toBeUndefined();
  });

  it('normalises backslashes to forward slashes', () => {
    const ref = makeSourceRef({ filePath: 'src\\utils\\helper.js' });
    expect(ref.filePath).toBe('src/utils/helper.js');
  });

  it('strips leading slashes', () => {
    const ref = makeSourceRef({ filePath: '/src/app.js' });
    expect(ref.filePath).toBe('src/app.js');
  });

  it('attaches startLine when provided', () => {
    const ref = makeSourceRef({ filePath: 'src/app.js', startLine: 42 });
    expect(ref.startLine).toBe(42);
  });

  it('attaches both start and end lines', () => {
    const ref = makeSourceRef({ filePath: 'src/app.js', startLine: 10, endLine: 20 });
    expect(ref.startLine).toBe(10);
    expect(ref.endLine).toBe(20);
  });

  it('ignores endLine when startLine is absent', () => {
    const ref = makeSourceRef({ filePath: 'src/app.js', endLine: 20 });
    expect(ref.endLine).toBeUndefined();
  });

  it('ignores endLine when it is less than startLine', () => {
    const ref = makeSourceRef({ filePath: 'src/app.js', startLine: 30, endLine: 5 });
    expect(ref.endLine).toBeUndefined();
  });

  it('throws when filePath is missing', () => {
    expect(() => makeSourceRef({})).toThrow();
  });

  it('throws when filePath is not a string', () => {
    expect(() => makeSourceRef({ filePath: 42 })).toThrow();
  });
});

// ── tryMakeSourceRef ───────────────────────────────────────────────────────────

describe('tryMakeSourceRef', () => {
  it('returns a ref for valid input', () => {
    const ref = tryMakeSourceRef({ filePath: 'src/app.js', startLine: 1 });
    expect(ref).not.toBeNull();
    expect(ref.filePath).toBe('src/app.js');
  });

  it('returns null for invalid input', () => {
    expect(tryMakeSourceRef({ filePath: null })).toBeNull();
    expect(tryMakeSourceRef({})).toBeNull();
    expect(tryMakeSourceRef(null)).toBeNull();
  });
});

// ── buildSourceUrl ─────────────────────────────────────────────────────────────

describe('buildSourceUrl', () => {
  it('builds the explorer URL with just a file path', () => {
    const ref = makeSourceRef({ filePath: 'src/app.js' });
    const url = buildSourceUrl('repo-abc', ref);
    expect(url).toBe('/explore/repo-abc/source?path=src%2Fapp.js');
  });

  it('appends a line number', () => {
    const ref = makeSourceRef({ filePath: 'src/app.js', startLine: 42 });
    const url = buildSourceUrl('repo-abc', ref);
    expect(url).toContain('line=42');
  });

  it('appends a line range', () => {
    const ref = makeSourceRef({ filePath: 'src/app.js', startLine: 10, endLine: 20 });
    const url = buildSourceUrl('repo-abc', ref);
    expect(url).toContain('line=10-20');
  });

  it('returns base explorer path for null ref', () => {
    const url = buildSourceUrl('repo-abc', null);
    expect(url).toBe('/explore/repo-abc/source');
  });

  it('returns base explorer path when ref has no filePath', () => {
    const url = buildSourceUrl('repo-abc', {});
    expect(url).toBe('/explore/repo-abc/source');
  });
});

// ── parseRefString ─────────────────────────────────────────────────────────────

describe('parseRefString', () => {
  it('parses a bare file path', () => {
    const ref = parseRefString('src/app.js');
    expect(ref.filePath).toBe('src/app.js');
    expect(ref.startLine).toBeUndefined();
  });

  it('parses path:line', () => {
    const ref = parseRefString('src/app.js:42');
    expect(ref.filePath).toBe('src/app.js');
    expect(ref.startLine).toBe(42);
  });

  it('parses path:start-end', () => {
    const ref = parseRefString('src/app.js:10-20');
    expect(ref.filePath).toBe('src/app.js');
    expect(ref.startLine).toBe(10);
    expect(ref.endLine).toBe(20);
  });

  it('parses bracket-wrapped references', () => {
    const ref = parseRefString('[src/app.js:42]');
    expect(ref.filePath).toBe('src/app.js');
    expect(ref.startLine).toBe(42);
  });

  it('returns null for empty string', () => {
    expect(parseRefString('')).toBeNull();
    expect(parseRefString(null)).toBeNull();
  });

  it('does not misinterpret non-numeric colon suffixes', () => {
    // e.g., a Windows path or a URL-style string
    const ref = parseRefString('src/app.js:not-a-number');
    // Falls back: treat whole thing as the file path
    expect(ref.filePath).toBe('src/app.js:not-a-number');
  });
});
