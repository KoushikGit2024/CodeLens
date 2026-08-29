const path = require('path');
const fs = require('fs');

function getDoc(req, res) {
  const requestedPath = req.query.path || 'README.md'; // Default to index
  
  // Safe base directory is the docs directory at the root of the project
  const docsBaseDir = path.resolve(__dirname, '../../../docs');
  
  // Resolve the requested file path
  const resolvedPath = path.resolve(docsBaseDir, requestedPath);

  // Path traversal protection
  if (!resolvedPath.startsWith(docsBaseDir + path.sep) && resolvedPath !== docsBaseDir && resolvedPath !== path.join(docsBaseDir, 'README.md')) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (!fs.existsSync(resolvedPath)) {
    return res.status(404).json({ error: 'Documentation file not found' });
  }

  const stat = fs.statSync(resolvedPath);
  if (stat.isDirectory()) {
    // Attempt to load README.md in that directory
    const readmePath = path.join(resolvedPath, 'README.md');
    if (fs.existsSync(readmePath)) {
      return res.json({ 
        path: path.join(requestedPath, 'README.md').replace(/\\/g, '/'),
        content: fs.readFileSync(readmePath, 'utf8') 
      });
    }
    return res.status(400).json({ error: 'Path is a directory' });
  }

  const content = fs.readFileSync(resolvedPath, 'utf8');
  return res.json({ path: requestedPath.replace(/\\/g, '/'), content });
}

module.exports = {
  getDoc,
};
