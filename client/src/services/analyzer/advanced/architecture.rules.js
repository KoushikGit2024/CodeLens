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
    },
  },
  {
    id: 'rule-api-isolation',
    name: 'API Layer Isolation',
    description: 'API components should not depend on Presentation components.',
    severity: 'warning',
    evaluate: (srcComp, tgtComp) => {
      return srcComp.layer === 'API' && tgtComp.layer === 'Presentation';
    },
  },
  {
    id: 'rule-data-isolation',
    name: 'Data Layer Isolation',
    description: 'Data components should not depend on Presentation or API components.',
    severity: 'critical',
    evaluate: (srcComp, tgtComp) => {
      return srcComp.layer === 'Data' && (tgtComp.layer === 'Presentation' || tgtComp.layer === 'API');
    },
  },
  {
    id: 'rule-stable-dependencies',
    name: 'Stable Dependencies Principle (SDP) Violation',
    description:
      'A stable component (low instability, high incoming coupling) should not depend on a more volatile component (high instability).',
    severity: 'warning',
    evaluate: (srcComp, tgtComp) => {
      const srcMetrics = srcComp.metrics;
      const tgtMetrics = tgtComp.metrics;
      if (!srcMetrics || !tgtMetrics) return false;
      // Stable component (I <= 0.3, Ca >= 2) depending on unstable component (I >= 0.7, Ce >= 2)
      return (
        srcMetrics.instability <= 0.3 &&
        srcMetrics.afferentCoupling >= 2 &&
        tgtMetrics.instability >= 0.7 &&
        tgtMetrics.efferentCoupling >= 2
      );
    },
  },
];

/**
 * It maps component layers, then extracts forbidden dependency edges,
 * and then it applies the findings schema to return architectural breaches.
 */
export function validateArchitecture(components, edges) {
  const findings = [];

  const compMap = new Map();
  for (const comp of components) {
    // Key by label (= what relations use as source/target), not by node id
    const label = comp.data?.label ?? comp.id;
    compMap.set(label, comp);
  }

  for (const edge of edges) {
    const srcComp = compMap.get(edge.source);
    const tgtComp = compMap.get(edge.target);

    if (!srcComp || !tgtComp) continue;

    const srcLayer = srcComp.data?.layer ?? 'Core/Other';
    const tgtLayer = tgtComp.data?.layer ?? 'Core/Other';

    const srcCompMock = {
      name: edge.source,
      layer: srcLayer,
      metrics: srcComp.data?.metrics,
    };
    const tgtCompMock = {
      name: edge.target,
      layer: tgtLayer,
      metrics: tgtComp.data?.metrics,
    };

    for (const rule of ARCHITECTURE_RULES) {
      if (rule.evaluate(srcCompMock, tgtCompMock)) {
        const message =
          rule.id === 'rule-stable-dependencies'
            ? `Stable Dependencies Principle violation: Stable component '${edge.source}' (I=${srcCompMock.metrics.instability}, Ca=${srcCompMock.metrics.afferentCoupling}) directly imports volatile component '${edge.target}' (I=${tgtCompMock.metrics.instability}, Ce=${tgtCompMock.metrics.efferentCoupling}).`
            : `Boundary violation: ${edge.source} (${srcLayer}) directly imports ${edge.target} (${tgtLayer}).\nRule: ${rule.description}`;

        findings.push({
          ...createAnalysisFinding({
            id: `ARCH-${rule.id}-${edge.source}-${edge.target}`,
            analyzerId: 'architecture',
            ruleId: rule.id,
            category: 'architecture',
            severity: rule.severity,
            title: rule.name,
            message,
            filePath: edge.evidenceFile || edge.source,
            range: {
              startLine: 1,
              startColumn: 1,
              endLine: 1,
              endColumn: 1,
            },
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
