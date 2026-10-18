import { describe, it, expect } from 'vitest';
import {
  analyzeReachability,
  detectUnusedExports,
  isEntryPoint,
  isExemptFile,
} from '../../../../src/services/analyzer/advanced/reachability.analyzer.js';

describe('reachability.analyzer', () => {
  describe('isEntryPoint', () => {
    it('identifies standard web and server entry points', () => {
      expect(isEntryPoint('src/index.js')).toBe(true);
      expect(isEntryPoint('src/index.ts')).toBe(true);
      expect(isEntryPoint('src/main.jsx')).toBe(true);
      expect(isEntryPoint('src/main.tsx')).toBe(true);
      expect(isEntryPoint('src/App.jsx')).toBe(true);
      expect(isEntryPoint('src/server.ts')).toBe(true);
    });

    it('identifies multi-language entry points', () => {
      expect(isEntryPoint('cmd/app/main.go')).toBe(true);
      expect(isEntryPoint('src/main.rs')).toBe(true);
      expect(isEntryPoint('src/lib.rs')).toBe(true);
      expect(isEntryPoint('app/main.py')).toBe(true);
      expect(isEntryPoint('manage.py')).toBe(true);
      expect(isEntryPoint('src/Main.java')).toBe(true);
      expect(isEntryPoint('src/com/example/MyApplication.java')).toBe(true);
      expect(isEntryPoint('src/Application.kt')).toBe(true);
      expect(isEntryPoint('Sources/main.swift')).toBe(true);
      expect(isEntryPoint('src/main.cpp')).toBe(true);
    });

    it('identifies modern file-based routing entry points', () => {
      expect(isEntryPoint('app/dashboard/page.tsx')).toBe(true);
      expect(isEntryPoint('app/layout.jsx')).toBe(true);
      expect(isEntryPoint('app/api/users/route.ts')).toBe(true);
      expect(isEntryPoint('src/routes/+page.svelte')).toBe(true);
    });

    it('returns false for regular internal service and utility files', () => {
      expect(isEntryPoint('src/utils/math.js')).toBe(false);
      expect(isEntryPoint('src/services/auth.service.ts')).toBe(false);
      expect(isEntryPoint('lib/calculator.py')).toBe(false);
      expect(isEntryPoint('pkg/db/connector.go')).toBe(false);
    });
  });

  describe('isExemptFile', () => {
    it('identifies test files across languages and conventions', () => {
      expect(isExemptFile('src/components/Button.test.jsx')).toBe(true);
      expect(isExemptFile('src/services/api.spec.ts')).toBe(true);
      expect(isExemptFile('tests/unit/test_auth.py')).toBe(true);
      expect(isExemptFile('pkg/service/user_test.go')).toBe(true);
      expect(isExemptFile('src/parser_test.rs')).toBe(true);
      expect(isExemptFile('src/__tests__/utils.js')).toBe(true);
    });

    it('identifies project configurations and tooling', () => {
      expect(isExemptFile('vite.config.js')).toBe(true);
      expect(isExemptFile('tsconfig.json')).toBe(true);
      expect(isExemptFile('package.json')).toBe(true);
      expect(isExemptFile('tailwind.config.ts')).toBe(true);
      expect(isExemptFile('pyproject.toml')).toBe(true);
      expect(isExemptFile('go.mod')).toBe(true);
      expect(isExemptFile('Cargo.toml')).toBe(true);
    });

    it('identifies scripts, setup, and stories', () => {
      expect(isExemptFile('src/setupTests.ts')).toBe(true);
      expect(isExemptFile('scripts/build.js')).toBe(true);
      expect(isExemptFile('migrations/001_create_users.sql')).toBe(true);
      expect(isExemptFile('src/components/Card.stories.tsx')).toBe(true);
    });

    it('returns false for actual production code', () => {
      expect(isExemptFile('src/features/dashboard/Dashboard.jsx')).toBe(false);
      expect(isExemptFile('src/services/payment.js')).toBe(false);
      expect(isExemptFile('internal/auth/tokens.go')).toBe(false);
    });
  });

  describe('analyzeReachability (Graph BFS)', () => {
    it('returns empty results for null or empty graph', () => {
      const res = analyzeReachability(null);
      expect(res.unreachableFiles).toEqual([]);
      expect(res.entryPoints).toEqual([]);
    });

    it('identifies unreachable dead files and ignores exempt files', () => {
      const graph = {
        nodes: [
          { id: 'src/index.js' },
          { id: 'src/used.js' },
          { id: 'src/dead.js' },
          { id: 'src/helper.test.js' }, // exempt test
          { id: 'vite.config.js' }, // exempt config
        ],
        edges: [{ source: 'src/index.js', target: 'src/used.js' }],
      };

      const res = analyzeReachability(graph);
      expect(res.entryPoints).toContain('src/index.js');
      expect(res.unreachableFiles).toContain('src/dead.js');
      expect(res.unreachableFiles).not.toContain('src/used.js');
      expect(res.unreachableFiles).not.toContain('src/helper.test.js');
      expect(res.unreachableFiles).not.toContain('vite.config.js');
      expect(res.exemptFilesCount).toBe(2);
    });
  });

  describe('detectUnusedExports (Symbol-Level Dead Code)', () => {
    it('returns empty array when files is empty or null', () => {
      expect(detectUnusedExports(null)).toEqual([]);
      expect(detectUnusedExports([])).toEqual([]);
    });

    it('flags exported symbols that are never imported anywhere', () => {
      const files = [
        {
          filePath: 'src/index.js', // entry point: imports usedFunc
          symbols: [
            {
              kind: 'import',
              source: './utils.js',
              specifiers: [{ name: 'usedFunc', type: 'named' }],
            },
          ],
        },
        {
          filePath: 'src/utils.js',
          symbols: [
            {
              kind: 'function',
              name: 'usedFunc',
              location: { startLine: 1, endLine: 5 },
            },
            {
              kind: 'function',
              name: 'deadFunc',
              location: { startLine: 7, endLine: 12 },
            },
            {
              kind: 'export',
              name: 'usedFunc',
              exportType: 'named',
              location: { startLine: 1, endLine: 5 },
            },
            {
              kind: 'export',
              name: 'deadFunc',
              exportType: 'named',
              location: { startLine: 7, endLine: 12 },
            },
          ],
        },
      ];

      const unused = detectUnusedExports(files);
      expect(unused).toHaveLength(1);
      expect(unused[0].name).toBe('deadFunc');
      expect(unused[0].kind).toBe('function');
      expect(unused[0].filePath).toBe('src/utils.js');
      expect(unused[0].location).toEqual({ startLine: 7, endLine: 12 });
    });

    it('does not flag exports in entry point files or exempt test files', () => {
      const files = [
        {
          filePath: 'src/index.js',
          symbols: [{ kind: 'export', name: 'publicApiFunction', exportType: 'named' }],
        },
        {
          filePath: 'src/utils.test.js',
          symbols: [{ kind: 'export', name: 'testHelper', exportType: 'named' }],
        },
      ];

      const unused = detectUnusedExports(files);
      expect(unused).toHaveLength(0);
    });

    it('does not flag exports of a module if that module is imported via namespace', () => {
      const files = [
        {
          filePath: 'src/app.js',
          symbols: [
            {
              kind: 'import',
              source: './helpers.js',
              specifiers: [{ name: '*', type: 'namespace' }],
            },
          ],
        },
        {
          filePath: 'src/helpers.js',
          symbols: [
            { kind: 'function', name: 'formatString', location: { startLine: 1, endLine: 3 } },
            { kind: 'export', name: 'formatString', exportType: 'named' },
          ],
        },
      ];

      const unused = detectUnusedExports(files);
      expect(unused).toHaveLength(0);
    });
  });

  describe('Integration with buildEngineeringRiskModel', () => {
    it('generates distinct risk cards for unreachable files and unused exports with location evidence', async () => {
      const { buildEngineeringRiskModel } = await import('../../../../src/services/analyzer/advanced/risk.analyzer.js');

      const analysis = {
        files: [
          {
            filePath: 'src/main.js',
            lineCount: 20,
            symbols: [
              {
                kind: 'import',
                source: './service.js',
                specifiers: [{ name: 'activeService', type: 'named' }],
              },
            ],
          },
          {
            filePath: 'src/service.js',
            lineCount: 40,
            symbols: [
              { kind: 'function', name: 'activeService', complexity: 2, location: { startLine: 1, endLine: 5 } },
              { kind: 'function', name: 'deadHelper', complexity: 1, location: { startLine: 10, endLine: 15 } },
              { kind: 'export', name: 'activeService', exportType: 'named', location: { startLine: 1, endLine: 5 } },
              { kind: 'export', name: 'deadHelper', exportType: 'named', location: { startLine: 10, endLine: 15 } },
            ],
          },
          {
            filePath: 'src/orphaned.js',
            lineCount: 50,
            symbols: [{ kind: 'function', name: 'orphanFunc', complexity: 1, location: { startLine: 1, endLine: 10 } }],
          },
        ],
      };

      const graph = {
        nodes: [{ id: 'src/main.js' }, { id: 'src/service.js' }, { id: 'src/orphaned.js' }],
        edges: [{ source: 'src/main.js', target: 'src/service.js' }],
      };

      const model = buildEngineeringRiskModel(analysis, graph, {});

      const deadFileRisk = model.risks.find(r => r.title === 'Dead / Unreachable File');
      expect(deadFileRisk).toBeDefined();
      expect(deadFileRisk.file).toBe('src/orphaned.js');
      expect(deadFileRisk.severity).toBe('warning');

      const unusedExportRisk = model.risks.find(r => r.title === 'Unused Exported Symbol');
      expect(unusedExportRisk).toBeDefined();
      expect(unusedExportRisk.file).toBe('src/service.js');
      expect(unusedExportRisk.description).toContain("'deadHelper'");
      expect(unusedExportRisk.evidence.location).toEqual({ startLine: 10, endLine: 15 });
      expect(unusedExportRisk.evidence.instances[0].name).toBe('deadHelper');
    });
  });
});
