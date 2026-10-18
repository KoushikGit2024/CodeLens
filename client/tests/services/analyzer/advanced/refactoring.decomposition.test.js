import { describe, it, expect } from 'vitest';
import {
  tokenizeIdentifier,
  buildSymbolGraph,
  calculateLCOM4,
  clusterSymbolsByCohesion,
  generateDecompositionBlueprint,
  buildRefactoringIntelligence,
  calculatePriority,
  ARCHETYPE_ROLES,
} from '../../../../src/services/analyzer/advanced/refactoring.analyzer.js';
import { SEVERITY } from '../../../../src/services/analyzer/advanced/risk.analyzer.js';

describe('refactoring.analyzer — LCOM4 & Cohesion Decomposition Engine', () => {
  describe('tokenizeIdentifier', () => {
    it('splits camelCase and snake_case into meaningful semantic stems', () => {
      expect(tokenizeIdentifier('fetchUserProfile')).toEqual(['fetch', 'user', 'profile']);
      expect(tokenizeIdentifier('validate_email_address')).toEqual(['validate', 'email', 'address']);
      expect(tokenizeIdentifier('parseJSONResponse')).toEqual(['parse', 'json', 'response']);
    });

    it('filters out common stop words', () => {
      expect(tokenizeIdentifier('getFunctionData')).toEqual([]);
    });
  });

  describe('buildSymbolGraph & calculateLCOM4', () => {
    it('returns 0 for empty symbols and 1 for a single symbol', () => {
      expect(calculateLCOM4([])).toBe(0);
      expect(calculateLCOM4([{ name: 'soloFunction', kind: 'function' }])).toBe(1);
    });

    it('calculates LCOM4 = 1 for a cohesive module where functions call each other', () => {
      const symbols = [
        {
          name: 'computeTax',
          kind: 'function',
          location: { startLine: 1, endLine: 3 },
          params: ['amount', 'region'],
        },
        {
          name: 'formatCurrency',
          kind: 'function',
          location: { startLine: 5, endLine: 7 },
          params: ['amount', 'region'],
        },
      ];
      const source = `function computeTax(amount, region) {
  return formatCurrency(amount * 0.2, region);
}

function formatCurrency(val, region) {
  return '$' + val;
}`;

      const lcom4 = calculateLCOM4(symbols, source);
      expect(lcom4).toBe(1);
    });

    it('calculates LCOM4 = 2 for two completely disconnected clusters', () => {
      const symbols = [
        // Cluster 1: Network / Data (connected via shared domain token 'record')
        {
          name: 'fetchRemoteRecord',
          kind: 'function',
          location: { startLine: 1, endLine: 3 },
          params: ['recordId'],
        },
        {
          name: 'saveRemoteRecord',
          kind: 'function',
          location: { startLine: 5, endLine: 7 },
          params: ['recordId', 'payload'],
        },
        // Cluster 2: String Formatting / Parsing (connected via shared domain token 'calendar')
        {
          name: 'formatCalendarTimestamp',
          kind: 'function',
          location: { startLine: 9, endLine: 11 },
          params: ['epochMs'],
        },
        {
          name: 'parseCalendarDate',
          kind: 'function',
          location: { startLine: 13, endLine: 15 },
          params: ['dateStr'],
        },
      ];
      const source = `function fetchRemoteRecord(recordId) {
  return http.get(recordId);
}

function saveRemoteRecord(recordId, payload) {
  return http.post(recordId, payload);
}

function formatCalendarTimestamp(epochMs) {
  return new Date(epochMs).toISOString();
}

function parseCalendarDate(dateStr) {
  return Date.parse(dateStr);
}`;

      const lcom4 = calculateLCOM4(symbols, source);
      expect(lcom4).toBe(2);
    });

    it('calculates LCOM4 >= 3 for three independent routine sets in a God module', () => {
      const symbols = [
        // Cluster 1: Network / API
        { name: 'fetchBillingData', kind: 'function', params: ['accountId'] },
        // Cluster 2: Formatting
        { name: 'formatCurrencyString', kind: 'function', params: ['cents'] },
        // Cluster 3: Validation
        { name: 'validatePostalCode', kind: 'function', params: ['zip'] },
      ];

      const lcom4 = calculateLCOM4(symbols);
      expect(lcom4).toBe(3);
    });
  });

  describe('clusterSymbolsByCohesion & Archetype Classification', () => {
    it('classifies clusters into target roles and generates appropriate file names', () => {
      const symbols = [
        {
          name: 'fetchAccountDetails',
          kind: 'function',
          location: { startLine: 1, endLine: 30 },
          params: ['accountId'],
        },
        {
          name: 'formatInvoiceNumber',
          kind: 'function',
          location: { startLine: 31, endLine: 50 },
          params: ['rawSeq'],
        },
      ];

      const clusters = clusterSymbolsByCohesion(symbols, '', 'src/modules/accountManager.js');
      expect(clusters).toHaveLength(2);

      const dataCluster = clusters.find(c => c.roleKey === 'DATA_ACCESS');
      const formatCluster = clusters.find(c => c.roleKey === 'FORMATTERS');

      expect(dataCluster).toBeDefined();
      expect(dataCluster.role).toBe(ARCHETYPE_ROLES.DATA_ACCESS.role);
      expect(dataCluster.targetFileName).toBe('accountManager.service.js');
      expect(dataCluster.symbols).toContain('fetchAccountDetails');

      expect(formatCluster).toBeDefined();
      expect(formatCluster.role).toBe(ARCHETYPE_ROLES.FORMATTERS.role);
      expect(formatCluster.targetFileName).toBe('accountManager.formatters.js');
      expect(formatCluster.symbols).toContain('formatInvoiceNumber');
    });
  });

  describe('generateDecompositionBlueprint', () => {
    it('generates a full blueprint with migration checklist for splittable files', () => {
      const fileAnalysis = {
        filePath: 'src/services/storeManager.js',
        lineCount: 350,
        symbols: [
          { name: 'fetchInventoryItems', kind: 'function', location: { startLine: 1, endLine: 60 } },
          { name: 'saveInventoryAudit', kind: 'function', location: { startLine: 61, endLine: 120 } },
          { name: 'formatInventoryLabel', kind: 'function', location: { startLine: 121, endLine: 170 } },
          { name: 'parseBarcodeData', kind: 'function', location: { startLine: 171, endLine: 210 } },
          { name: 'validateSkuCode', kind: 'function', location: { startLine: 211, endLine: 250 } },
        ],
      };

      const blueprint = generateDecompositionBlueprint(fileAnalysis);

      expect(blueprint).toBeDefined();
      expect(blueprint.lcom4).toBeGreaterThanOrEqual(2);
      expect(blueprint.clusters.length).toBeGreaterThanOrEqual(2);
      expect(blueprint.migrationSteps.length).toBeGreaterThan(0);
      expect(blueprint.originalFile).toBe('src/services/storeManager.js');
    });
  });

  describe('buildRefactoringIntelligence integration', () => {
    it('attaches decomposition blueprints to candidates matching size or coupling risks', () => {
      const mockRiskModel = {
        score: 75,
        risks: [
          {
            category: 'SIZE',
            title: 'Very large file (High LOC)',
            description: 'Module is excessively large and complex.',
            severity: SEVERITY.CRITICAL,
            file: 'src/core/godModule.js',
            evidence: { lineCount: 650 },
          },
        ],
        hotspots: [],
      };

      const mockAnalysis = {
        files: [
          {
            filePath: 'src/core/godModule.js',
            lineCount: 650,
            symbols: [
              { name: 'fetchNetworkPackets', kind: 'function', location: { startLine: 1, endLine: 80 } },
              { name: 'formatPacketPayload', kind: 'function', location: { startLine: 81, endLine: 150 } },
              { name: 'validateChecksum', kind: 'function', location: { startLine: 151, endLine: 220 } },
            ],
          },
        ],
      };

      const result = buildRefactoringIntelligence(mockRiskModel, mockAnalysis, { nodes: [] });

      expect(result.candidateCount).toBeGreaterThan(0);
      const targetCandidate = result.candidates.find(c => c.mainFile === 'src/core/godModule.js');
      expect(targetCandidate).toBeDefined();
      expect(targetCandidate.decompositionBlueprint).toBeDefined();
      expect(targetCandidate.decompositionBlueprint.lcom4).toBe(3);
      expect(targetCandidate.decompositionBlueprint.clusters).toHaveLength(3);
    });

    it('calculates priority correctly across severity and categories', () => {
      const priorityCrit = calculatePriority({
        severity: SEVERITY.CRITICAL,
        category: 'DEPENDENCY',
        title: 'Circular Dependency',
      });
      expect(priorityCrit.priority).toBe('critical');
      expect(priorityCrit.priorityScore).toBeGreaterThanOrEqual(80);

      const priorityWarn = calculatePriority({
        severity: SEVERITY.WARNING,
        category: 'SIZE',
        title: 'Large file',
      });
      expect(priorityWarn.priorityScore).toBeLessThan(80);
    });
  });

  describe('Dynamic Strategy Synthesis Engine', () => {
    it('synthesizes UI component-specific strategies for oversized JSX files', () => {
      const risk = {
        category: 'SIZE',
        title: 'Very large file (520 lines)',
        file: 'src/components/DashboardView.jsx',
        evidence: { lineCount: 520 },
      };
      const result = buildRefactoringIntelligence({ risks: [risk] }, { files: [] }, { nodes: [] });
      const candidate = result.candidates[0];

      expect(candidate.suggestedStrategies).toHaveLength(2);
      expect(candidate.suggestedStrategies[0].action).toContain(
        'Extract Atomic Sub-Components from `DashboardView.jsx`'
      );
      expect(candidate.suggestedStrategies[1].action).toContain('useDashboardView');
    });

    it('synthesizes controller-specific strategies for oversized controllers', () => {
      const risk = {
        category: 'SIZE',
        title: 'Large file (410 lines)',
        file: 'src/controllers/authController.js',
        evidence: { lineCount: 410 },
      };
      const result = buildRefactoringIntelligence({ risks: [risk] }, { files: [] }, { nodes: [] });
      const candidate = result.candidates[0];

      expect(candidate.suggestedStrategies[0].action).toContain('Extract Business Service `authController.service.js`');
      expect(candidate.suggestedStrategies[1].action).toContain('authController.schema.js');
    });

    it('synthesizes function-specific cognitive complexity strategies with exact names and scores', () => {
      const risk = {
        category: 'QUALITY',
        title: 'High Cognitive Complexity in parseSyntaxTree',
        file: 'src/parser/astParser.js',
        evidence: {
          functions: [
            {
              name: 'parseSyntaxTree',
              cognitiveComplexity: 28,
              maxNestingDepth: 5,
              startLine: 42,
            },
          ],
        },
      };
      const result = buildRefactoringIntelligence({ risks: [risk] }, { files: [] }, { nodes: [] });
      const candidate = result.candidates[0];

      expect(candidate.suggestedStrategies[0].action).toContain(
        'Decompose Complex Function `parseSyntaxTree` (Cognitive: 28)'
      );
      expect(candidate.suggestedStrategies[0].description).toContain('line 42');
      expect(candidate.suggestedStrategies[1].action).toContain(
        'Invert Nested Branches with Guard Clauses (Flatten Depth: 5)'
      );
    });

    it('synthesizes cycle-specific strategies naming participating files in circular dependencies', () => {
      const risk = {
        category: 'DEPENDENCY',
        title: 'Circular Dependency',
        file: 'src/modules/orderService.js',
        evidence: {
          cyclePath: ['src/modules/orderService.js', 'src/modules/paymentGateway.js', 'src/modules/orderService.js'],
        },
      };
      const result = buildRefactoringIntelligence({ risks: [risk] }, { files: [] }, { nodes: [] });
      const candidate = result.candidates[0];

      expect(candidate.suggestedStrategies[0].action).toContain('orderService.js');
      expect(candidate.suggestedStrategies[0].action).toContain('paymentGateway.js');
    });
  });
});
