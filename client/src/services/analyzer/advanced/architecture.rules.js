/**
 * architecture.rules.js
 * 
 * It registers strict boundary policies, then extracts layer interaction violations, 
 * and then it applies the unified AnalysisFinding schema for the dashboard.
 */

import { createAnalysisFinding } from '../parsing/symbols.js';

export const ARCHITECTURE_RULES = [
  {
    id: 'rule-presentation-isolation',
    name: 'Presentation Layer Isolation',
    description: 'Presentation components should not directly depend on Data components.',
    severity: 'critical',
    evaluate: (srcComp, tgtComp) => {
      return srcComp.layer === 'Presentation' && tgtComp.layer === 'Data';
    }
  },
  {
    id: 'rule-api-isolation',
    name: 'API Layer Isolation',
    description: 'API components should not depend on Presentation components.',
    severity: 'warning',
    evaluate: (srcComp, tgtComp) => {
      return srcComp.layer === 'API' && tgtComp.layer === 'Presentation';
    }
  },
  {
    id: 'rule-data-isolation',
    name: 'Data Layer Isolation',
    description: 'Data components should not depend on Presentation or API components.',
    severity: 'critical',
    evaluate: (srcComp, tgtComp) => {
      return srcComp.layer === 'Data' && (tgtComp.layer === 'Presentation' || tgtComp.layer === 'API');
    }
  }
];

/**
 * It maps component layers, then extracts forbidden dependency edges, 
 * and then it applies the findings schema to return architectural breaches.
 */
export function validateArchitecture(components, edges) {
  const findings = [];
  
  const compLayerMap = new Map();
  for (const comp of components) {
    // Key by label (= what relations use as source/target), not by node id
    const label = comp.data?.label ?? comp.id;
    compLayerMap.set(label, comp.data?.layer ?? 'Core/Other');
  }

  for (const edge of edges) {
    const srcLayer = compLayerMap.get(edge.source);
    const tgtLayer = compLayerMap.get(edge.target);

    if (!srcLayer || !tgtLayer) continue;

    const srcCompMock = { name: edge.source, layer: srcLayer };
    const tgtCompMock = { name: edge.target, layer: tgtLayer };

    for (const rule of ARCHITECTURE_RULES) {
      if (rule.evaluate(srcCompMock, tgtCompMock)) {
        
        // It detects a rule failure, then extracts the edge source, and then it applies the frontend finding format.
        findings.push({
          ...createAnalysisFinding({
            id: `ARCH-${rule.id}-${edge.source}`,
            analyzerId: 'architecture',
            ruleId: rule.id,
            category: 'architecture',
            severity: rule.severity,
            title: rule.name,
            message: `Boundary violation: ${edge.source} (${srcLayer}) directly imports ${edge.target} (${tgtLayer}).\nRule: ${rule.description}`,
            filePath: edge.evidenceFile || edge.source,
            range: {
              startLine: 1,
              startColumn: 1,
              endLine: 1,
              endColumn: 1
            }
          }),
          // Extra fields consumed by graphToFlow for node/edge highlighting
          sourceComponent: edge.source,
          targetComponent: edge.target,
        });
      }
    }
  }

  return findings;
}