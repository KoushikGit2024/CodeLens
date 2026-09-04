const fs = require('fs');
const path = require('path');

const srcFiles = [
  'server/src/domains/repository/intelligence.analyzer.js',
  'server/src/domains/engineering/risk.analyzer.js',
  'server/src/domains/engineering/change.impact.js',
  'server/src/domains/engineering/refactoring.analyzer.js',
  'server/src/domains/engineering/refactoring.strategies.js',
  'server/src/domains/assistant/context/base.context.js',
  'server/src/domains/assistant/context/question.context.js',
  'server/src/domains/assistant/question.router.js',
  'server/src/domains/assistant/context/documentation.context.js',
  'server/src/domains/assistant/context/repository.intelligence.context.js'
];

const destDir = 'client/src/services/analyzer/advanced';

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

for (const srcFile of srcFiles) {
  if (!fs.existsSync(srcFile)) {
    console.error(`File not found: ${srcFile}`);
    continue;
  }

  let content = fs.readFileSync(srcFile, 'utf8');

  // Convert requires to imports
  // e.g. const { buildEngineeringRiskModel } = require('../engineering/risk.analyzer');
  // -> import { buildEngineeringRiskModel } from './risk.analyzer.js';
  
  content = content.replace(/const\s+(?:\{([^}]+)\}|(\w+))\s*=\s*require\((['"])(.*?)\3\);/g, (match, namedExports, defaultExport, quote, reqPath) => {
    // We'll just map everything to local imports, assuming we flatten the directory
    let newPath = reqPath;
    
    // Flatten paths: if it's requiring from '../engineering/risk.analyzer', it becomes './risk.analyzer.js'
    const baseName = path.basename(reqPath);
    newPath = `./${baseName}`;
    if (!newPath.endsWith('.js')) {
      newPath += '.js';
    }
    
    if (baseName === 'dependency.analyzer') {
       newPath = '../dependencies/dependency.analyzer.js';
    } else if (baseName === 'uuid') {
       newPath = 'uuid';
    }

    if (namedExports) {
      return `import { ${namedExports.trim()} } from '${newPath}';`;
    } else {
      return `import ${defaultExport} from '${newPath}';`;
    }
  });

  // Convert module.exports
  // module.exports = { ... };
  // -> export { ... };
  content = content.replace(/module\.exports\s*=\s*\{([^}]+)\};/g, 'export { $1 };');
  content = content.replace(/module\.exports\s*=\s*(\w+);/g, 'export default $1;');
  content = content.replace(/'use strict';\n*/g, '');

  const destFile = path.join(destDir, path.basename(srcFile));
  fs.writeFileSync(destFile, content);
  console.log(`Ported ${srcFile} to ${destFile}`);
}
