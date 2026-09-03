import { hashContent } from '@/services/analyzer/repository/fingerprint.js';

describe('fingerprint', () => {
  it('should generate identical hashes for identical content', async () => {
    const content = 'const a = 1;';
    expect(await hashContent(content)).toBe(await hashContent(content));
  });

  it('should generate different hashes for different content', async () => {
    const content1 = 'const a = 1;';
    const content2 = 'const a = 2;';
    expect(await hashContent(content1)).not.toBe(await hashContent(content2));
  });
});
