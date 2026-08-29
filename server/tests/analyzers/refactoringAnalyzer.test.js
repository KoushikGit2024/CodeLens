const { buildRefactoringIntelligence, calculatePriority } = require('../../src/analyzers/refactoringAnalyzer');
const { SEVERITY, RISK_CATEGORIES } = require('../../src/analyzers/engineeringRiskAnalyzer');

describe('Refactoring Analyzer', () => {

  test('calculatePriority computes score correctly', () => {
    const risk = {
      title: 'Circular Dependency',
      category: RISK_CATEGORIES.DEPENDENCY,
      severity: SEVERITY.CRITICAL,
    };
    
    // Impact: DEPENDENCY=3.0, Severity: CRITICAL=3.0, Confidence: 'Circular Dependency'=1.0
    // Score = Math.round(3.0 * 3.0 * 1.0 * 11) = 99 -> bounded to 100 max
    const p = calculatePriority(risk);
    expect(p.priorityScore).toBe(99);
    expect(p.priority).toBe('critical');
    expect(p.impact).toBe('high');
    expect(p.confidence).toBe('high');
  });

  test('buildRefactoringIntelligence maps risks to candidates', () => {
    const mockRiskModel = {
      risks: [
        {
          id: '1',
          title: 'Circular Dependency between A and B',
          category: RISK_CATEGORIES.DEPENDENCY,
          severity: SEVERITY.CRITICAL,
          description: 'A imports B and B imports A',
          file: 'a.js',
          evidence: { cyclePath: ['a.js', 'b.js', 'a.js'] }
        },
        {
          id: '2',
          title: 'Large file',
          category: RISK_CATEGORIES.SIZE,
          severity: SEVERITY.WARNING,
          description: 'This file is slightly large',
          file: 'large.js'
        }
      ]
    };

    const intel = buildRefactoringIntelligence(mockRiskModel);
    expect(intel.candidateCount).toBe(2);
    
    // Circular dependency should be scored higher and be sorted first
    expect(intel.candidates[0].type).toBe(RISK_CATEGORIES.DEPENDENCY);
    expect(intel.candidates[0].priorityScore).toBeGreaterThan(intel.candidates[1].priorityScore);
    
    // Check files extraction
    expect(intel.candidates[0].files).toContain('a.js');
    expect(intel.candidates[0].files).toContain('b.js');
    
    // Check strategies
    expect(intel.candidates[0].suggestedStrategies.length).toBeGreaterThan(0);
    expect(intel.candidates[0].suggestedStrategies[0].action).toBe('Extract Shared Abstraction');
  });

  test('ignores unresolved dependencies', () => {
    const mockRiskModel = {
      risks: [
        {
          id: '1',
          title: 'Unresolved Dependencies',
          category: RISK_CATEGORIES.DEPENDENCY,
          severity: SEVERITY.HIGH,
          description: 'Missing node_modules',
        }
      ]
    };

    const intel = buildRefactoringIntelligence(mockRiskModel);
    expect(intel.candidateCount).toBe(0);
  });
});
