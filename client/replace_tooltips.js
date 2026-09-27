const fs = require('fs');
const path = require('path');

function walk(dir, files = []) {
  for (const f of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, f);
    if (fs.statSync(fullPath).isDirectory()) {
      if (f !== 'node_modules' && f !== 'dist') walk(fullPath, files);
    } else if (f.endsWith('.jsx')) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = walk('src');
files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  // Match a < followed by a lowercase word (html tag)
  // then any characters until we see title=
  const newContent = content.replace(/<([a-z]+[a-z0-9]*)([^>]*?)\btitle=/g, (match, tag, rest) => {
    return `<${tag}${rest}data-tooltip=`;
  });
  
  if (content !== newContent) {
    fs.writeFileSync(f, newContent);
    console.log('Updated: ' + f);
  }
});
