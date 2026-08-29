const fs = require('fs');
const path = require('path');

const adrDir = path.join(__dirname, '..', 'docs', 'adr');
const files = fs.readdirSync(adrDir).filter(f => f.startsWith('ADR-') && f.endsWith('.md'));

for (const file of files) {
  const p = path.join(adrDir, file);
  let content = fs.readFileSync(p, 'utf-8');
  
  // ensure Status, Context, Decision, Consequences, Alternatives Considered, Related Documentation
  
  if (!content.includes('## Alternatives Considered')) {
    content += '\n## Alternatives Considered\n\nNot documented for this ADR.\n';
  }
  if (!content.includes('## Related Documentation')) {
    content += '\n## Related Documentation\n\nNot documented for this ADR.\n';
  }
  
  // Also we want to ensure the headers are exactly formatted, but a simple append is safer than complex parsing if it already has most.
  fs.writeFileSync(p, content);
}
console.log('ADR standardization complete');
