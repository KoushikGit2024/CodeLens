import { describe, it, expect } from 'vitest';
import { toMermaid } from '../../../../src/services/analyzer/advanced/mermaid.transformer';

describe('Mermaid Transformer', () => {
  it('returns empty fallback for no data', () => {
    const result = toMermaid({});
    expect(result).toContain('Empty[No architecture data available]');
  });

  it('escapes special characters in node IDs', () => {
    const model = {
      components: [
        {
          id: 'my-special@node!',
          data: { label: 'my-special@node!', layer: 'Domain' },
          health: { severity: 'healthy' },
        },
      ],
      relations: [],
      violations: [],
    };
    const result = toMermaid(model);
    expect(result).toContain('my_special_node_["my-special@node!"]');
  });

  it('groups components by layer in subgraphs', () => {
    const model = {
      components: [
        { id: 'CompA', layer: 'Domain', health: { severity: 'healthy' } },
        { id: 'CompB', layer: 'API', health: { severity: 'healthy' } },
      ],
      relations: [],
      violations: [],
    };
    const result = toMermaid(model);
    expect(result).toContain('subgraph Domain [Domain]');
    expect(result).toContain('subgraph API [API]');
    expect(result).toContain('CompA["CompA"]');
    expect(result).toContain('CompB["CompB"]');
  });

  it('renders edges and highlights violations', () => {
    const model = {
      components: [
        { id: 'CompA', layer: 'Domain', health: { severity: 'healthy' } },
        { id: 'CompB', layer: 'API', health: { severity: 'healthy' } },
      ],
      relations: [{ source: 'CompB', target: 'CompA', type: 'calls' }],
      violations: [{ sourceComponent: 'CompB', targetComponent: 'CompA' }],
    };
    const result = toMermaid(model);
    expect(result).toContain('CompB -->|"calls"| CompA');
    expect(result).toContain('stroke:#ff7b72'); // Violation link style
  });

  it('extracts external dependencies', () => {
    const model = {
      components: [{ id: 'CompA', layer: 'Domain', health: { severity: 'healthy' } }],
      relations: [{ source: 'CompA', target: 'pkg:react', type: 'imports', targetType: 'external' }],
      violations: [],
    };
    const result = toMermaid(model);
    expect(result).toContain('subgraph Externals');
    expect(result).toContain('pkg_react["pkg:react"]');
    expect(result).toContain('CompA -->|"imports"| pkg_react');
  });
});
