/**
 * refactoring.strategies.js
 *
 * Synthesizes dynamic, context-aware refactoring action plans tailored to each
 * individual file, architectural layer, function complexity, and modular blueprint.
 */

import { RISK_CATEGORIES } from './risk.analyzer.js';

export const REFACTORING_STRATEGIES = {
  CIRCULAR_DEPENDENCY: [
    {
      action: 'Extract Shared Abstraction',
      description: 'Move the code that both modules depend on into a new, independent third module.',
      expectedBenefits: ['Breaks cycle', 'Improves testability', 'Increases cohesion'],
      risks: ['Creates a new micro-module', 'Requires updating imports in both files'],
    },
    {
      action: 'Invert Dependency (Dependency Injection)',
      description: 'Instead of importing the dependency, pass it in via function arguments or class constructors.',
      expectedBenefits: ['Breaks cycle', 'Decouples modules'],
      risks: ['Increases API surface complexity'],
    },
    {
      action: 'Merge Modules',
      description: 'If the modules are small and highly cohesive, merge them into a single file.',
      expectedBenefits: ['Eliminates cycle completely', 'Simplifies architecture'],
      risks: ['May create a large file (Size Risk)'],
    },
  ],

  OVERSIZED_FILE: [
    {
      action: 'Extract Cohesive Module',
      description:
        'Identify a distinct responsibility (e.g., data fetching, string formatting) and move it to a separate file.',
      expectedBenefits: ['Improves readability', 'Reduces cognitive load', 'Easier to test'],
      risks: ['Requires updating imports across the codebase'],
    },
    {
      action: 'Separate Domain from Infrastructure',
      description: 'Move business logic to a pure domain file, leaving only I/O and glue code in this file.',
      expectedBenefits: ['Highly testable domain logic', 'Clearer architecture'],
      risks: ['Takes significant refactoring effort'],
    },
  ],

  BROAD_API_SURFACE: [
    {
      action: 'Introduce Façade',
      description:
        'Create a façade module that exports only the strictly necessary symbols, keeping others private or internal.',
      expectedBenefits: ['Hides implementation details', 'Reduces coupling surface'],
      risks: ['Adds an extra layer of indirection'],
    },
    {
      action: 'Group Related Exports',
      description:
        'Export a single object/class/namespace containing related functions instead of many individual functions.',
      expectedBenefits: ['Cleaner consumer imports'],
      risks: ['Can lead to God-objects if not careful'],
    },
  ],

  HIGH_FAN_OUT: [
    {
      action: 'Split Responsibilities',
      description:
        'The module likely does too much. Split it into smaller modules, each coordinating fewer dependencies.',
      expectedBenefits: ['Reduces module fragility', 'Easier to test'],
      risks: ['May increase fan-in on the newly created modules'],
    },
    {
      action: 'Introduce Service Boundary',
      description: 'Group related dependencies behind a single service interface.',
      expectedBenefits: ['Reduces direct coupling to many external/internal modules'],
      risks: ['Requires interface design'],
    },
  ],

  HIGH_FAN_IN: [
    {
      action: 'Validate as Healthy Utility',
      description:
        'If this is a genuine core utility (like a logger or generic helper), high fan-in is expected and healthy.',
      expectedBenefits: ['No action needed'],
      risks: ['May mask a God-module'],
    },
    {
      action: 'Segregate Interfaces',
      description:
        'If different consumers use completely different parts of this module, split the module into smaller, consumer-specific modules.',
      expectedBenefits: ["Prevents consumers from depending on code they don't use"],
      risks: ['Increases number of utility modules'],
    },
  ],

  CROSS_LAYER_VIOLATION: [
    {
      action: 'Introduce Service Abstraction',
      description:
        'Insert an intermediate service layer that the presentation layer calls, which in turn calls the data layer.',
      expectedBenefits: ['Restores architectural integrity', 'Allows mocking for presentation tests'],
      risks: ['Adds boilerplate'],
    },
    {
      action: 'Invert Dependency',
      description: 'Define an interface in the presentation layer that the data layer implements.',
      expectedBenefits: ['Decouples presentation from data'],
      risks: ['Requires interface/DI setup'],
    },
  ],

  COMPLEXITY: [
    {
      action: 'Extract Method',
      description: 'Break down large, complex functions into smaller, private helper functions.',
      expectedBenefits: ['Improves readability', 'Easier to unit test individual pieces'],
      risks: ['Can increase the number of functions in the class/module'],
    },
    {
      action: 'Simplify Conditionals',
      description: 'Consolidate nested IF statements, or use early returns (guard clauses).',
      expectedBenefits: ['Flattens code structure', 'Reduces cognitive load'],
      risks: ['None'],
    },
  ],

  CLONES: [
    {
      action: 'Extract Utility Function',
      description:
        'Move the duplicated logic into a single, shared utility function and call it from all clone locations.',
      expectedBenefits: ["DRY (Don't Repeat Yourself)", 'Fix bugs in one place'],
      risks: ['May create a slightly unnatural abstraction if the contexts differ slightly'],
    },
  ],

  DEAD_CODE: [
    {
      action: 'Safe Deletion',
      description: 'Remove the file or module from the codebase entirely since it is never imported or used.',
      expectedBenefits: ['Reduces bundle size', 'Improves maintainability by removing clutter'],
      risks: ['Ensure it is not dynamically imported or used by external scripts (e.g. webpack entrypoints)'],
    },
  ],

  LOW_COHESION: [
    {
      action: 'Decompose by Cohesion (LCOM4)',
      description:
        'The module contains disconnected method clusters that do not share state or call each other. Extract each cluster into a dedicated single-responsibility file according to the decomposition blueprint.',
      expectedBenefits: [
        'Drastically improves cohesion',
        'Enables isolated unit testing',
        'Eliminates God-file antipattern',
      ],
      risks: ['Requires updating consumer imports or maintaining a barrel re-export'],
    },
    {
      action: 'Separate Domain Services from Utilities',
      description:
        'Extract data access, formatting, and validation clusters into separate helper modules, keeping only top-level orchestration in the entry file.',
      expectedBenefits: ['Separates concerns', 'Reduces cognitive complexity'],
      risks: ['Adds module boundaries'],
    },
  ],
};

/**
 * Detects architectural role of a file from its path, extension, and naming patterns.
 */
function detectFileRole(filePath) {
  if (!filePath) return { isComponent: false, isController: false, isService: false, isHook: false, isUtility: false };

  const lower = filePath.toLowerCase();
  const fileName = filePath.split('/').pop();
  const ext = fileName.includes('.') ? '.' + fileName.split('.').pop() : '';

  return {
    isComponent:
      ext === '.jsx' ||
      ext === '.tsx' ||
      ext === '.vue' ||
      lower.includes('/components/') ||
      lower.includes('/views/') ||
      lower.includes('/pages/'),
    isController: lower.includes('controller') || lower.includes('/controllers/') || lower.includes('/routes/'),
    isService: lower.includes('service') || lower.includes('/services/'),
    isHook: fileName.startsWith('use') || lower.includes('/hooks/'),
    isUtility:
      lower.includes('util') || lower.includes('helper') || lower.includes('/utils/') || lower.includes('/helpers/'),
    isParser: lower.includes('parser') || lower.includes('/parsing/'),
  };
}

/**
 * Synthesizes dynamic, issue-specific refactoring strategies that directly reference
 * the target file, its specific line count, affected functions, and decomposition clusters.
 */
export function getStrategiesForRisk(risk, context = {}) {
  const filePath = risk.file || context.affectedFiles?.[0] || '';
  const fileName = filePath ? filePath.split('/').pop() : 'this module';
  const baseName = fileName.replace(/\.[^/.]+$/, '');
  const ext = fileName.includes('.') ? '.' + fileName.split('.').pop() : '.js';
  const role = detectFileRole(filePath);
  const evidence = risk.evidence || {};
  const blueprint = context.blueprint || risk.decompositionBlueprint || null;

  const strategies = [];

  // ── 1. LOW COHESION / DECOMPOSITION BLUEPRINT (LCOM4) ──────────────────────
  if (blueprint && blueprint.clusters && blueprint.clusters.length > 1) {
    const c1 = blueprint.clusters[0];
    const c2 = blueprint.clusters[1];
    strategies.push({
      action: `Execute LCOM4 Modular Decomposition (Split into ${blueprint.clusterCount} Files)`,
      description: `Extract ${c1.role} (${c1.symbols.slice(0, 3).join(', ')}${c1.symbols.length > 3 ? '...' : ''}) into \`${c1.targetFileName}\` and ${c2.role} into \`${c2.targetFileName}\` to eliminate the multi-responsibility bottleneck in \`${fileName}\`.`,
      expectedBenefits: [
        `Reduces \`${fileName}\` size to ~${Math.round((evidence.lineCount || 350) / blueprint.clusterCount)} lines`,
        `Transforms LCOM4 from ${blueprint.lcom4} to optimal cohesive score of 1.0`,
        'Enables independent unit test files per responsibility',
      ],
      risks: [`Requires updating imports or re-exporting symbols from \`${fileName}\` for backwards compatibility`],
    });

    strategies.push({
      action: `Preserve Facade & Re-export in \`${fileName}\``,
      description: `Retain \`${fileName}\` as a thin orchestration facade that imports and re-exports the newly extracted sub-modules, preventing any breaking changes across consumer files.`,
      expectedBenefits: [
        '100% backwards-compatible public API contract',
        'Zero merge conflicts in existing caller files',
        'Transparent architectural improvement',
      ],
      risks: ['Maintains one additional indirection layer'],
    });

    return strategies;
  }

  // ── 2. SIZE & OVERSIZED FILES ─────────────────────────────────────────────
  if (
    risk.category === RISK_CATEGORIES.SIZE ||
    risk.title.includes('Very large file') ||
    risk.title.includes('Large file')
  ) {
    const lines = evidence.lineCount || 'excessive';

    if (role.isComponent) {
      strategies.push({
        action: `Extract Atomic Sub-Components from \`${fileName}\``,
        description: `The ${lines}-line JSX template in \`${fileName}\` mixes layout, card rendering, and user controls. Break off sub-elements into \`${baseName}Header\`, \`${baseName}Content\`, and \`${baseName}Actions\`.`,
        expectedBenefits: [
          `Reduces re-render blast radius in \`${baseName}\``,
          'Drastically improves JSX visual readability',
          'Enables isolated Storybook / visual regression testing',
        ],
        risks: ['May require passing shared state or callbacks down to child components'],
      });

      strategies.push({
        action: `Extract Custom Hook \`use${baseName.replace(/^./, c => c.toUpperCase())}\` for Business Logic`,
        description: `Move lifecycle effects, state hooks, and event handlers from \`${fileName}\` into a dedicated custom hook \`use${baseName}.js\`, leaving \`${fileName}\` as a pure, testable presentational component.`,
        expectedBenefits: [
          'Strict separation of view rendering from state lifecycle',
          'Enables headless unit testing of hook logic without browser DOM rendering',
        ],
        risks: ['Requires passing callback handlers back to the presentation component'],
      });
    } else if (role.isController) {
      strategies.push({
        action: `Extract Business Service \`${baseName}.service${ext}\` from \`${fileName}\``,
        description: `Move business operations, database queries, and transaction workflows out of \`${fileName}\` (${lines} lines) into a standalone service module, keeping controller routes focused purely on HTTP status codes and transport.`,
        expectedBenefits: [
          'Keeps route handlers under 60 lines of code',
          'Business logic can be reused across CLI, workers, and API endpoints',
        ],
        risks: ['Requires passing request context or auth tokens to service methods'],
      });

      strategies.push({
        action: `Extract Schema & DTO Validation into \`${baseName}.schema${ext}\``,
        description: `Move incoming payload validation, sanitization rules, and output serialization out of \`${fileName}\` into a dedicated schema contract file.`,
        expectedBenefits: [
          'Declarative, centralized request validation',
          'Eliminates duplicate imperative IF/ELSE validation checks across handlers',
        ],
        risks: ['Schema versioning must be kept in sync with API versions'],
      });
    } else if (role.isService) {
      strategies.push({
        action: `Partition \`${fileName}\` by Command vs Query Operations (CQRS)`,
        description: `Split \`${fileName}\` (${lines} lines) into \`${baseName}Query.service${ext}\` (read-only queries) and \`${baseName}Command.service${ext}\` (mutation/write operations).`,
        expectedBenefits: [
          'Optimizes caching for read operations independently of write locks',
          'Dramatically simplifies method signatures and internal state dependencies',
        ],
        risks: ['Requires coordinating callers that perform combined read-modify-write actions'],
      });

      strategies.push({
        action: `Extract Data Access Adapter for \`${fileName}\``,
        description: `Isolate raw database queries, HTTP clients, and caching layers out of \`${fileName}\` into dedicated repository or adapter modules.`,
        expectedBenefits: [
          'Allows clean mock injection during unit tests',
          'Shields business domain rules from database schema evolutions',
        ],
        risks: ['Adds repository interface boilerplate'],
      });
    } else {
      strategies.push({
        action: `Extract Cohesive Helper Module from \`${fileName}\` (${lines} lines)`,
        description: `Identify secondary responsibilities in \`${fileName}\` (e.g. data formatting, validation, or I/O helpers) and move them to \`${baseName}.helpers${ext}\`.`,
        expectedBenefits: [
          `Reduces \`${fileName}\` size below the warning threshold`,
          'Decreases cognitive load for code reviewers and future maintainers',
        ],
        risks: ['Requires updating import specifiers in participating files'],
      });

      strategies.push({
        action: `Separate Core Domain Logic from Infrastructure Glue in \`${fileName}\``,
        description: `Extract pure algorithms and calculations from \`${fileName}\` into \`${baseName}.core${ext}\`, keeping only external library wiring in \`${fileName}\`.`,
        expectedBenefits: [
          '100% testable domain algorithms with zero mock dependencies',
          'Clean, modular architectural layering',
        ],
        risks: ['Initial refactoring investment required'],
      });
    }

    return strategies;
  }

  // ── 3. COGNITIVE & CYCLOMATIC COMPLEXITY ───────────────────────────────────
  if (risk.category === RISK_CATEGORIES.QUALITY && risk.title.includes('Complexity')) {
    const funcs = evidence.functions || evidence.instances || [];
    const topFn = funcs[0] || null;
    const fnName = topFn?.name || topFn?.functionName || 'the complex function';
    const cogScore = topFn?.cognitiveComplexity || topFn?.complexity || 'elevated';
    const nestDepth = topFn?.maxNestingDepth || topFn?.nestingDepth || 4;
    const startLine = topFn?.startLine || topFn?.location?.startLine;

    strategies.push({
      action: `Decompose Complex Function \`${fnName}\` (Cognitive: ${cogScore})`,
      description: `Function \`${fnName}\`${startLine ? ` at line ${startLine}` : ''} in \`${fileName}\` has an elevated cognitive complexity of ${cogScore}. Break down its nested branches into focused private helpers (e.g. \`${fnName}Helper\`).`,
      expectedBenefits: [
        `Flattens cognitive score of \`${fnName}\` to under 8`,
        'Every sub-decision becomes an independently testable unit',
        'Improves readability and self-documenting code clarity',
      ],
      risks: ['May require passing temporary state between the extracted helper functions'],
    });

    strategies.push({
      action: `Invert Nested Branches with Guard Clauses (Flatten Depth: ${nestDepth})`,
      description: `Replace deeply nested IF/ELSE conditions in \`${fnName}\` (currently nesting ${nestDepth} levels deep) with early exit returns or guard clauses, flattening execution to depth 1.`,
      expectedBenefits: [
        'Eliminates the "arrow anti-pattern" and rightward code drift',
        'Happy path is clearly visible at the top level of the function',
      ],
      risks: ['None — pure structural refactoring with zero API changes'],
    });

    strategies.push({
      action: `Replace Conditional Switch with Lookup Map or Strategy Pattern`,
      description: `If \`${fnName}\` branches based on type, action, or status codes, replace the conditional blocks with a keyed dictionary or Strategy pattern dispatch.`,
      expectedBenefits: [
        'Adheres to the Open/Closed Principle (OCP)',
        'Adding new cases requires adding map entries with zero modifications to core logic',
      ],
      risks: ['Slight indirection for small, static enumerations'],
    });

    return strategies;
  }

  // ── 4. COUPLING & HIGH FAN-OUT / FAN-IN ────────────────────────────────────
  if (risk.category === RISK_CATEGORIES.COUPLING) {
    if (risk.title.includes('fan-out') || risk.title.includes('Tukey') || risk.title.includes('Efferent')) {
      const fanOut = evidence.fanOut || evidence.outgoingCount || 'numerous';

      strategies.push({
        action: `Introduce Domain Gateway for \`${fileName}\` (${fanOut} Outgoing Dependencies)`,
        description: `\`${fileName}\` directly imports and coordinates ${fanOut} external modules. Group related dependencies behind a single domain gateway or facade interface to shield \`${fileName}\` from ripple updates.`,
        expectedBenefits: [
          `Dramatically lowers efferent coupling (Ce) of \`${fileName}\``,
          'Prevents upstream API changes in dependencies from breaking core workflows',
        ],
        risks: ['Requires designing an intermediate gateway interface'],
      });

      strategies.push({
        action: `Apply Dependency Inversion (DIP) in \`${fileName}\``,
        description: `Instead of \`${fileName}\` instantiating dependencies directly, pass them in as parameters or constructor arguments to invert dependency flow.`,
        expectedBenefits: [
          'High testability via mock injection without monkey-patching',
          'Decouples high-level policy from low-level infrastructure modules',
        ],
        risks: ['Requires call-site configuration or factory wiring'],
      });

      return strategies;
    }

    if (risk.title.includes('Co-Change') || risk.title.includes('Temporal')) {
      const coupled = evidence.coupledFiles?.[0] || evidence.fileB || 'coupled file';
      const coupledName = coupled.split('/').pop();
      const sharedCommits = evidence.sharedCommits || evidence.coChangeCount || 10;
      const similarity = Math.round((evidence.coChangeSimilarity || evidence.jaccard || 0.4) * 100);

      strategies.push({
        action: `Unify Shared Contract between \`${fileName}\` and \`${coupledName}\``,
        description: `\`${fileName}\` and \`${coupledName}\` commit together in ${sharedCommits} commits (${similarity}% co-change) without a static import statement. Unify their shared data structures or schemas into a single canonical definition.`,
        expectedBenefits: [
          'Eliminates hidden synchronization bugs when one file is updated without the other',
          'Makes implicit contractual coupling explicit and type-safe',
        ],
        risks: ['Both files will gain a static import on the new shared module'],
      });

      strategies.push({
        action: `Extract Shared Domain Service`,
        description: `Merge duplicated business rules that cause \`${fileName}\` and \`${coupledName}\` to co-modify into a shared domain utility or service.`,
        expectedBenefits: [
          'Single source of truth for business operations',
          'Prevents divergence in business rule updates',
        ],
        risks: ['Requires reconciling any minor implementation differences between the two files'],
      });

      return strategies;
    }

    if (risk.title.includes('SDP') || risk.title.includes('Stability')) {
      const target = evidence.targetFile || 'unstable module';
      const targetName = target.split('/').pop();

      strategies.push({
        action: `Invert Dependency from \`${fileName}\` to \`${targetName}\``,
        description: `\`${fileName}\` is a stable core module that depends on volatile leaf \`${targetName}\`, violating the Stable Dependencies Principle (SDP). Move the interface declaration into \`${fileName}\` and have \`${targetName}\` implement it.`,
        expectedBenefits: [
          'Prevents volatile changes in leaf modules from cascading backwards into core architecture',
          'Restores Clean Architecture dependency hierarchy',
        ],
        risks: ['Requires interface/contract declaration'],
      });

      return strategies;
    }

    return REFACTORING_STRATEGIES.HIGH_FAN_OUT;
  }

  // ── 5. CIRCULAR DEPENDENCY ────────────────────────────────────────────────
  if (risk.category === RISK_CATEGORIES.DEPENDENCY && risk.title.includes('Circular')) {
    const cycle = evidence.cyclePath || context.affectedFiles || [];
    const chainStr = cycle.length > 0 ? cycle.map(f => `\`${f.split('/').pop()}\``).join(' ↔ ') : `\`${fileName}\``;

    strategies.push({
      action: `Extract Shared Contract for Cycle (${chainStr})`,
      description: `Break the circular dependency between ${chainStr} by moving shared interfaces, type definitions, or common utilities into a separate, independent \`${baseName}.shared${ext}\` module.`,
      expectedBenefits: [
        'Completely resolves runtime module evaluation deadlocks and undefined imports',
        'Produces clean, acyclic dependency graph topology',
      ],
      risks: ['Requires updating import paths in all participating cycle files'],
    });

    strategies.push({
      action: `Decouple with Event Emitter or Injected Callback`,
      description: `Replace the static import between participating files with an event notification or callback injection to sever the hard compile-time cycle.`,
      expectedBenefits: [
        'Eliminates static coupling between cyclic modules',
        'Improves modular testability in isolation',
      ],
      risks: ['Slightly less direct stack trace debugging compared to static function calls'],
    });

    return strategies;
  }

  // ── 6. CODE CLONES / DUPLICATION ──────────────────────────────────────────
  if (risk.title.includes('Clone') || risk.category === RISK_CATEGORIES.QUALITY) {
    if (risk.title.includes('Clone')) {
      const linesDup = evidence.linesDuplicated || 'duplicated';
      const cloneCount = evidence.cloneCount || 2;

      strategies.push({
        action: `Extract Shared Utility Function for \`${fileName}\``,
        description: `Consolidate the ${linesDup} duplicated lines across ${cloneCount} locations into a canonical shared utility function in \`${baseName}.utils${ext}\`.`,
        expectedBenefits: [
          'DRY principle enforced: bug fixes apply in one place',
          'Reduces overall codebase line count and testing maintenance',
        ],
        risks: ['Ensure subtle differences between call sites are parameterized with options'],
      });

      strategies.push({
        action: `Parameterize Divergent Logic with Options Object`,
        description: `If clone instances have slight variations, pass a configuration object or strategy callback into the unified function.`,
        expectedBenefits: ['Flexible, reusable abstraction that covers all existing use cases'],
        risks: ['Avoid over-engineering with excessive conditional flags'],
      });

      return strategies;
    }

    if (risk.title.includes('Dead')) {
      const sym = evidence.symbolName || 'unused symbol';
      const startLine = evidence.location?.startLine ? ` at line ${evidence.location.startLine}` : '';

      strategies.push({
        action: `Safely Delete Dead Symbol \`${sym}\` in \`${fileName}\``,
        description: `Symbol \`${sym}\`${startLine} in \`${fileName}\` is never imported or referenced across the entire repository. Verify no dynamic imports or external library consumers before deletion.`,
        expectedBenefits: [
          'Reduces bundle size and eliminates dead code maintenance overhead',
          'Prevents confusion for developers navigating the codebase',
        ],
        risks: ['Ensure symbol is not invoked via dynamic reflection or external script tags'],
      });

      strategies.push({
        action: `Scope Symbol to Module-Private (Remove Export)`,
        description: `If \`${sym}\` is still used internally within \`${fileName}\`, remove the \`export\` keyword so it is not exposed in the public module interface.`,
        expectedBenefits: [
          'Minimizes public API surface',
          'Allows bundler tree-shaking to optimize unused internal references',
        ],
        risks: ['None'],
      });

      return strategies;
    }
  }

  // ── 7. FALLBACK / GENERAL ─────────────────────────────────────────────────
  strategies.push({
    action: `Refactor \`${fileName}\` into Focused Sub-Modules`,
    description: `Break down the responsibilities in \`${fileName}\` into dedicated single-purpose files to improve maintainability and testability.`,
    expectedBenefits: ['Decreases cognitive load', 'Enables isolated unit testing'],
    risks: ['Requires updating import specifiers'],
  });

  return strategies;
}
