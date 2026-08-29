const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');

// File extensions that are never extracted (executables, compiled binaries, etc.)
const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.dll', '.so', '.dylib', '.bin', '.bat', '.cmd', '.sh',
  '.com', '.msi', '.dmg', '.pkg', '.deb', '.rpm',
  '.pyc', '.pyo', '.class', '.o', '.a', '.lib',
]);

// Filenames that are always skipped (secrets / sensitive)
const BLOCKED_NAMES = new Set([
  '.env', '.env.local', '.env.production', '.env.development',
  '.npmrc', '.yarnrc',
]);

/**
 * Safely extract a ZIP archive into destDir.
 * Guards against:
 *   - path traversal (entries that would escape destDir)
 *   - blocked file extensions
 *   - blocked filenames
 *
 * @param {string} zipPath   — absolute path to the ZIP file on disk
 * @param {string} destDir   — absolute destination directory
 */
async function safeExtract(zipPath, destDir) {
  let zip;
  try {
    zip = new AdmZip(zipPath);
  } catch (err) {
    throw new Error(`Cannot open ZIP: ${err.message}`);
  }

  const entries = zip.getEntries();
  if (entries.length === 0) {
    throw new Error('ZIP archive is empty');
  }

  // Create destination directory
  fs.mkdirSync(destDir, { recursive: true });

  for (const entry of entries) {
    // Normalise and resolve the target path
    const entryName = entry.entryName.replace(/\\/g, '/');

    // Skip macOS metadata entries
    if (entryName.startsWith('__MACOSX/') || path.basename(entryName) === '.DS_Store') {
      continue;
    }

    const targetPath = path.resolve(destDir, entryName);

    // Path traversal guard
    if (!targetPath.startsWith(destDir + path.sep) && targetPath !== destDir) {
      console.warn(`[zipExtractor] Blocked path-traversal entry: ${entryName}`);
      continue;
    }

    if (entry.isDirectory) {
      fs.mkdirSync(targetPath, { recursive: true });
      continue;
    }

    const ext = path.extname(entryName).toLowerCase();
    const base = path.basename(entryName);

    if (BLOCKED_EXTENSIONS.has(ext)) {
      console.warn(`[zipExtractor] Skipped blocked extension: ${entryName}`);
      continue;
    }
    if (BLOCKED_NAMES.has(base)) {
      console.warn(`[zipExtractor] Skipped blocked filename: ${entryName}`);
      continue;
    }

    // Ensure parent directory exists
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });

    // Write file
    fs.writeFileSync(targetPath, entry.getData());
  }
}

module.exports = { safeExtract };
