'use strict';

const { analyzeChangeImpact } = require('../../../src/domains/engineering/change.impact');

describe('changeImpact', () => {
  it('should identify direct and transitive dependents', () => {
    // Mock analysis and graph
    const analysis = {
      files: [
        { filePath: 'src/a.js' },
        { filePath: 'src/b.js' },
        { filePath: 'src/c.js' },
        { filePath: 'src/d.js' },
      ]
    };
    
    // a -> b -> c -> d  (a imports b, b imports c, c imports d)
    // If d changes, c is directly affected. b and a are transitively affected.
    const graph = {
      nodes: [
        { id: 'file:src/a.js', type: 'file', filePath: 'src/a.js' },
        { id: 'file:src/b.js', type: 'file', filePath: 'src/b.js' },
        { id: 'file:src/c.js', type: 'file', filePath: 'src/c.js' },
        { id: 'file:src/d.js', type: 'file', filePath: 'src/d.js' },
      ],
      edges: [
        { source: 'file:src/a.js', target: 'file:src/b.js', type: 'imports' },
        { source: 'file:src/b.js', target: 'file:src/c.js', type: 'imports' },
        { source: 'file:src/c.js', target: 'file:src/d.js', type: 'imports' },
      ]
    };

    const impact = analyzeChangeImpact(analysis, graph, ['src/d.js']);
    
    expect(impact.changedFiles).toEqual(['src/d.js']);
    expect(impact.directlyAffectedFiles).toEqual(['src/c.js']);
    expect(impact.transitivelyAffectedFiles).toEqual(['src/a.js', 'src/b.js'].sort());
  });

  it('should identify affected architecture components', () => {
    const analysis = {
      files: [
        { filePath: 'src/controllers/auth.js', symbols: [] },
        { filePath: 'src/services/auth.js', symbols: [] },
      ]
    };
    
    const graph = {
      nodes: [
        { id: 'file:src/controllers/auth.js', type: 'file', filePath: 'src/controllers/auth.js' },
        { id: 'file:src/services/auth.js', type: 'file', filePath: 'src/services/auth.js' },
      ],
      edges: [
        { source: 'file:src/controllers/auth.js', target: 'file:src/services/auth.js', type: 'imports' },
      ]
    };

    const impact = analyzeChangeImpact(analysis, graph, ['src/services/auth.js']);
    
    expect(impact.directlyAffectedFiles).toEqual(['src/controllers/auth.js']);
    // Since architectureAnalyzer puts controllers/ in "Controllers" and services/ in "Services":
    expect(impact.affectedComponents).toContain('controllers');
    expect(impact.affectedComponents).toContain('services');
  });
});
