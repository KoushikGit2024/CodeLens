const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT_DIR, 'docs');

let hasErrors = false;

function getAllMarkdownFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      if (!filePath.includes('node_modules') && !filePath.includes('.git')) {
        getAllMarkdownFiles(filePath, fileList);
      }
    } else if (file.endsWith('.md')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

function checkLinks(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  // Match standard markdown links: [text](url)
  // Ignoring code blocks (rough heuristic, we just match the pattern)
  const linkRegex = /\[[^\]]*\]\(([^)]+)\)/g;
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    let link = match[1].trim();

    // Ignore web URLs, anchors, mailto
    if (link.startsWith('http://') || link.startsWith('https://') || link.startsWith('#') || link.startsWith('mailto:')) {
      continue;
    }

    // Strip internal anchors from the path (e.g., file.md#section)
    const hashIndex = link.indexOf('#');
    if (hashIndex !== -1) {
      link = link.substring(0, hashIndex);
    }

    // If it's empty after stripping hash, it was just an anchor
    if (!link) continue;

    let targetPath;
    if (link.startsWith('/')) {
      // Treat absolute paths as relative to ROOT_DIR for this validation
      targetPath = path.join(ROOT_DIR, link.substring(1));
    } else {
      // Relative path
      targetPath = path.resolve(path.dirname(filePath), link);
    }

    if (!fs.existsSync(targetPath)) {
      hasErrors = true;
      console.error(`❌ Broken link in ${path.relative(ROOT_DIR, filePath)}`);
      console.error(`   -> Points to non-existent file: ${link}`);
    }
  }
}

function run() {
  console.log('Checking documentation links...');
  const files = getAllMarkdownFiles(ROOT_DIR);
  console.log(`Found ${files.length} markdown files to check.\n`);

  for (const file of files) {
    checkLinks(file);
  }

  if (hasErrors) {
    console.error('\nDocumentation validation failed. Please fix broken links.');
    process.exit(1);
  } else {
    console.log('\n✅ All internal markdown links are valid.');
    process.exit(0);
  }
}

run();
