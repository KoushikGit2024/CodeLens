import { describe, it, expect, vi } from 'vitest';
import {
  generateEngineeringHealthReportMarkdown,
  downloadEngineeringHealthReport,
} from '../../../src/features/engineering/healthReport.generator';

describe('healthReport.generator', () => {
  const mockModel = {
    score: 82,
    metrics: { totalFiles: 45, totalRisks: 3, critical: 1, high: 1, warning: 1 },
    risks: [
      {
        id: 'risk_ed58fa10',
        title: 'Behavioral Hotspot (Critical Active Risk)',
        category: 'QUALITY',
        severity: 'critical',
        file: 'src/utils/parser.js',
        description: 'Function parseAST has complexity 34.',
        evidence: {
          hotspotScore: 88,
          churnScore: 70,
          complexityScore: 95,
          quadrant: 'CRITICAL_HOTSPOT',
          location: { startLine: 12, endLine: 85 },
        },
      },
      {
        id: 'risk_a91b2c3d',
        title: 'Circular Dependency in Auth Flow',
        category: 'DEPENDENCY',
        severity: 'high',
        file: 'src/auth/service.js',
        description: 'Circular import with session.js',
        evidence: {
          cyclePath: ['src/auth/service.js', 'src/auth/session.js', 'src/auth/service.js'],
        },
      },
      {
        id: 'risk_ignored_99',
        title: 'Structural Code Clone',
        category: 'QUALITY',
        severity: 'warning',
        file: 'src/components/card.jsx',
        description: 'Clone found in card2.jsx',
        evidence: {
          instances: [{ filePath: 'src/components/card.jsx' }, { filePath: 'src/components/card2.jsx' }],
        },
      },
    ],
    ignoredRisks: [
      {
        id: 'risk_ignored_99',
        title: 'Structural Code Clone',
        category: 'QUALITY',
        severity: 'warning',
        file: 'src/components/card.jsx',
      },
    ],
  };

  it('generates rich markdown report with scorecard, diagrams, and deep links', () => {
    const md = generateEngineeringHealthReportMarkdown({
      model: mockModel,
      repoId: 'test-repo',
      score: 85,
      ignoredIds: new Set(['risk_ignored_99']),
      insights: {
        summary: 'Solid architectural foundation with a single hotspot in parser.js',
        observations: ['High churn in parser.js'],
        recommendations: ['Decompose parseAST into sub-parsers'],
      },
      adrs: [
        {
          cacheKey: 'adr_risk_ed58fa10',
          data: {
            title: 'Decompose AST Parser',
            status: 'Accepted',
            decision: 'Split parseAST into modular visitor functions.',
          },
        },
      ],
    });

    // Scorecard
    expect(md).toContain('# 🏛️ CodeLens Engineering Health & Architectural Audit Report');
    expect(md).toContain('**Engineering Health Score** | **85 / 100**');
    expect(md).toContain('**Total Files Analyzed** | **45**');

    // Mermaid charts
    expect(md).toContain('```mermaid\npie title Engineering Risks by Category');
    expect(md).toContain('```mermaid\ngraph TD');
    expect(md).toContain('🔥 parser.js');

    // Roadmap
    expect(md).toContain('Break Circular Dependency Cycles (Critical Priority)');
    expect(md).toContain('Refactor Behavioral Hotspots (High Priority)');

    // Findings & Deep Links
    expect(md).toContain('`risk_ed58fa10`');
    expect(md).toContain('src/utils/parser.js#L12');
    expect(md).toContain('Inspect in CodeLens Explore View');

    // AI & ADRs
    expect(md).toContain('Decompose AST Parser');
    expect(md).toContain('Split parseAST into modular visitor functions');
    expect(md).toContain('Solid architectural foundation with a single hotspot in parser.js');

    // Ignored audit trail
    expect(md).toContain('Suppressed & Ignored Risks Audit Trail');
    expect(md).toContain('risk_ignored_99');
  });

  it('downloads report using browser Blob and ObjectURL', async () => {
    const mockClick = vi.fn();
    const mockAppendChild = vi.fn();
    const mockRemoveChild = vi.fn();

    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });

    const mockAnchor = {
      href: '',
      download: '',
      click: mockClick,
    };

    vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor);
    vi.spyOn(document.body, 'appendChild').mockImplementation(mockAppendChild);
    vi.spyOn(document.body, 'removeChild').mockImplementation(mockRemoveChild);

    const mockApi = {
      listADRs: vi.fn().mockResolvedValue({ data: [] }),
    };

    await downloadEngineeringHealthReport({
      model: mockModel,
      repoId: 'acme/webapp',
      score: 82,
      ignoredIds: new Set(),
      repositoryApi: mockApi,
    });

    expect(mockAnchor.download).toMatch(/engineering_health_acme_webapp_/);
    expect(mockClick).toHaveBeenCalled();
    expect(mockAppendChild).toHaveBeenCalledWith(mockAnchor);
    expect(mockRemoveChild).toHaveBeenCalledWith(mockAnchor);
  });
});
