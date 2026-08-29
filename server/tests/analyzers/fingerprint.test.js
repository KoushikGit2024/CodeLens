'use strict';

const { hashContent } = require('../../src/analyzers/fingerprint');

describe('fingerprint', () => {
  it('should generate identical hashes for identical content', () => {
    const content = 'const a = 1;';
    expect(hashContent(content)).toBe(hashContent(content));
  });

  it('should generate different hashes for different content', () => {
    const content1 = 'const a = 1;';
    const content2 = 'const a = 2;';
    expect(hashContent(content1)).not.toBe(hashContent(content2));
  });
});
