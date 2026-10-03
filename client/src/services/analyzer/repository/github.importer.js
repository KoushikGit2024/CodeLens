import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import FS from '@isomorphic-git/lightning-fs';
import { Buffer } from 'buffer';

// isomorphic-git needs the Buffer global in the browser
if (typeof window !== 'undefined') {
  window.Buffer = window.Buffer || Buffer;
}

export async function cloneAndExtractGithub(url, onProgress) {
  // Use a temporary unique name for the filesystem
  const fsName = `github-clone-${Date.now()}`;
  const fs = new FS(fsName);
  const pfs = fs.promises;
  const dir = '/repo';

  onProgress({ loaded: 10, total: 100, phase: 'Cloning repository...' });

  try {
    // 1. Clone the repository
    await git.clone({
      fs,
      http,
      dir,
      url,
      corsProxy: 'https://cors.isomorphic-git.org',
      singleBranch: true,
      depth: 1, // shallow clone to be fast
    });

    onProgress({ loaded: 50, total: 100, phase: 'Extracting files...' });

    // 2. Traverse the filesystem to build a list of files with their content
    const filesToSave = [];

    async function walk(currentPath, relativePath = '') {
      const entries = await pfs.readdir(currentPath);
      for (const entry of entries) {
        if (entry === '.git') continue; // We don't need git history

        const fullPath = `${currentPath}/${entry}`;
        const relPath = relativePath ? `${relativePath}/${entry}` : entry;
        const stat = await pfs.stat(fullPath);

        if (stat.isDirectory()) {
          await walk(fullPath, relPath);
        } else {
          const contentBytes = await pfs.readFile(fullPath);
          // Check if it's likely an image
          const extMatch = relPath.match(/\.(png|jpe?g|gif|webp|ico|bmp)$/i);
          if (extMatch) {
            // Convert to base64 data url for images
            const blob = new Blob([contentBytes]);
            const dataUrl = await new Promise(resolve => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.readAsDataURL(blob);
            });
            filesToSave.push({ path: relPath, content: dataUrl });
          } else {
            // Assume text file
            const decoder = new TextDecoder('utf-8');
            const textContent = decoder.decode(contentBytes);
            filesToSave.push({ path: relPath, content: textContent });
          }
        }
      }
    }

    await walk(dir);

    return filesToSave;
  } finally {
    // Cleanup: try to wipe the temporary lightning-fs if possible to free space
    try {
      // LightningFS doesn't have a built-in destroy, but we can try to clear IndexedDB directly
      // However, it's safer to just let it be or overwrite it next time.
      // For now, we leave it since it's an ephemeral named DB.
    } catch (e) {
      console.warn('Failed to cleanup temp github fs', e);
    }
  }
}
