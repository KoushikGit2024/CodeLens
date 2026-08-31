'use strict';

/**
 * architecture.rules.js
 * 
 * Enforces strict architectural boundaries and rules based on detected components and their dependencies.
 */

const ARCHITECTURE_RULES = [
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
    severity: 'high',
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

function validateArchitecture(components, relations) {
  const violations = [];
  
  // Create a map for quick layer lookup
  const compLayerMap = new Map();
  for (const comp of components) {
    compLayerMap.set(comp.name, comp.layer);
  }

  for (const rel of relations) {
    if (rel.targetType !== 'internal') continue; // Rules only apply to internal components

    const srcLayer = compLayerMap.get(rel.source);
    const tgtLayer = compLayerMap.get(rel.target);

    if (!srcLayer || !tgtLayer) continue;

    const srcCompMock = { name: rel.source, layer: srcLayer };
    const tgtCompMock = { name: rel.target, layer: tgtLayer };

    for (const rule of ARCHITECTURE_RULES) {
      if (rule.evaluate(srcCompMock, tgtCompMock)) {
        violations.push({
          ruleId: rule.id,
          name: rule.name,
          description: rule.description,
          severity: rule.severity,
          sourceComponent: rel.source,
          targetComponent: rel.target,
          evidenceFile: rel.evidenceFile
        });
      }
    }
  }

  return violations;
}

module.exports = {
  validateArchitecture,
  ARCHITECTURE_RULES
};
