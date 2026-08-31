const { buildContext } = require('./src/domains/assistant/context/base.context');

const files = Array.from({ length: 10 }, (_, i) => ({
  path: `src/auth${i}.js`,
  symbols: [{ name: 'login' }],
}));

function makeAnalysis(files, extra = {}) {
  return {
    status: 'ready',
    analyzedFiles: files.length,
    languageSummary: { javascript: files.length },
    files: files.map(f => ({
      filePath: f.path,
      language: 'javascript',
      hasErrors: false,
      error: null,
      symbols: [
        ...(f.symbols || []).map(s => ({ kind: s.kind || 'function', name: s.name, location: { startLine: 1, startColumn: 0, endLine: 5, endColumn: 1 } })),
      ],
    })),
    name: extra.name || 'test-repo',
  };
}

const analysis = makeAnalysis(files);

const ctx = buildContext(analysis, 'How does auth login work?', '/fake', {
  maxFiles: 10,
  maxSourceChars: 5,
});

console.log(ctx.truncated);
console.log(ctx.totalSourceChars);
console.log(ctx.files.map(f => f.source));
