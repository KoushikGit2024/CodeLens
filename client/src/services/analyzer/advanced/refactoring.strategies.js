

import { RISK_CATEGORIES } from './risk.analyzer.js';

/**
 * Maps deterministic engineering risks to actionable refactoring strategies.
 * These are recommendations and do not automatically modify source code.
 */

const REFACTORING_STRATEGIES = {
  // --- DEPENDENCY RISKS ---
  CIRCULAR_DEPENDENCY: [
    {
      action: 'Extract Shared Abstraction',
      description: 'Move the code that both modules depend on into a new, independent third module.',
      expectedBenefits: ['Breaks cycle', 'Improves testability', 'Increases cohesion'],
      risks: ['Creates a new micro-module', 'Requires updating imports in both files']
    },
    {
      action: 'Invert Dependency (Dependency Injection)',
      description: 'Instead of importing the dependency, pass it in via function arguments or class constructors.',
      expectedBenefits: ['Breaks cycle', 'Decouples modules'],
      risks: ['Increases API surface complexity']
    },
    {
      action: 'Merge Modules',
      description: 'If the modules are small and highly cohesive, merge them into a single file.',
      expectedBenefits: ['Eliminates cycle completely', 'Simplifies architecture'],
      risks: ['May create a large file (Size Risk)']
    }
  ],

  // --- SIZE RISKS ---
  OVERSIZED_FILE: [
    {
      action: 'Extract Cohesive Module',
      description: 'Identify a distinct responsibility (e.g., data fetching, string formatting) and move it to a separate file.',
      expectedBenefits: ['Improves readability', 'Reduces cognitive load', 'Easier to test'],
      risks: ['Requires updating imports across the codebase']
    },
    {
      action: 'Separate Domain from Infrastructure',
      description: 'Move business logic to a pure domain file, leaving only I/O and glue code in this file.',
      expectedBenefits: ['Highly testable domain logic', 'Clearer architecture'],
      risks: ['Takes significant refactoring effort']
    }
  ],
  BROAD_API_SURFACE: [
    {
      action: 'Introduce Façade',
      description: 'Create a façade module that exports only the strictly necessary symbols, keeping others private or internal.',
      expectedBenefits: ['Hides implementation details', 'Reduces coupling surface'],
      risks: ['Adds an extra layer of indirection']
    },
    {
      action: 'Group Related Exports',
      description: 'Export a single object/class/namespace containing related functions instead of many individual functions.',
      expectedBenefits: ['Cleaner consumer imports'],
      risks: ['Can lead to God-objects if not careful']
    }
  ],

  // --- COUPLING RISKS ---
  HIGH_FAN_OUT: [
    {
      action: 'Split Responsibilities',
      description: 'The module likely does too much. Split it into smaller modules, each coordinating fewer dependencies.',
      expectedBenefits: ['Reduces module fragility', 'Easier to test'],
      risks: ['May increase fan-in on the newly created modules']
    },
    {
      action: 'Introduce Service Boundary',
      description: 'Group related dependencies behind a single service interface.',
      expectedBenefits: ['Reduces direct coupling to many external/internal modules'],
      risks: ['Requires interface design']
    }
  ],
  HIGH_FAN_IN: [
    {
      action: 'Validate as Healthy Utility',
      description: 'If this is a genuine core utility (like a logger or generic helper), high fan-in is expected and healthy.',
      expectedBenefits: ['No action needed'],
      risks: ['May mask a God-module']
    },
    {
      action: 'Segregate Interfaces',
      description: 'If different consumers use completely different parts of this module, split the module into smaller, consumer-specific modules.',
      expectedBenefits: ['Prevents consumers from depending on code they don\'t use'],
      risks: ['Increases number of utility modules']
    }
  ],

  // --- ARCHITECTURE RISKS ---
  CROSS_LAYER_VIOLATION: [
    {
      action: 'Introduce Service Abstraction',
      description: 'Insert an intermediate service layer that the presentation layer calls, which in turn calls the data layer.',
      expectedBenefits: ['Restores architectural integrity', 'Allows mocking for presentation tests'],
      risks: ['Adds boilerplate']
    },
    {
      action: 'Invert Dependency',
      description: 'Define an interface in the presentation layer that the data layer implements.',
      expectedBenefits: ['Decouples presentation from data'],
      risks: ['Requires interface/DI setup']
    }
  ]
};

function getStrategiesForRisk(risk) {
  switch (risk.category) {
    case RISK_CATEGORIES.DEPENDENCY:
      if (risk.title.includes('Circular')) return REFACTORING_STRATEGIES.CIRCULAR_DEPENDENCY;
      return [];
    case RISK_CATEGORIES.SIZE:
      if (risk.title.includes('Very large file') || risk.title.includes('Large file')) return REFACTORING_STRATEGIES.OVERSIZED_FILE;
      if (risk.title.includes('API surface')) return REFACTORING_STRATEGIES.BROAD_API_SURFACE;
      return [];
    case RISK_CATEGORIES.COUPLING:
      if (risk.title.includes('fan-out')) return REFACTORING_STRATEGIES.HIGH_FAN_OUT;
      if (risk.title.includes('fan-in')) return REFACTORING_STRATEGIES.HIGH_FAN_IN;
      return [];
    case RISK_CATEGORIES.ARCHITECTURE:
      if (risk.title.includes('Cross-Layer')) return REFACTORING_STRATEGIES.CROSS_LAYER_VIOLATION;
      return [];
    default:
      return [];
  }
}

export { 
  REFACTORING_STRATEGIES,
  getStrategiesForRisk
 };
