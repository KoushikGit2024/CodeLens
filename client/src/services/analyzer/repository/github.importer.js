import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import FS from '@isomorphic-git/lightning-fs';
import { Buffer } from 'buffer';

// isomorphic-git needs the Buffer global in the browser
if (typeof window !== 'undefined') {
  window.Buffer = window.Buffer || Buffer;
}

export async function cloneAndExtractGithub(url, onProgress, fetchAllBranches = false) {
  // Use a temporary unique name for the filesystem
  const fsName = `github-clone-${Date.now()}`;
  const fs = new FS(fsName);
  const pfs = fs.promises;
  const dir = '/repo';

  onProgress({ loaded: 10, total: 100, phase: 'Cloning repository...' });

  try {
    // 1. Clone the repository (with retries and progress tracking)
    let cloneSuccess = false;
    let lastError = null;
    
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        if (attempt > 1) {
          onProgress({ loaded: 10, total: 100, phase: `Retrying clone (Attempt ${attempt}/3)...` });
        }
        await git.clone({
          fs,
          http,
          dir,
          url,
          corsProxy: 'https://cors.isomorphic-git.org',
          singleBranch: !fetchAllBranches,
          depth: import.meta.env.DEV ? undefined : 1, // shallow clone in prod to save bandwidth
          onProgress: (evt) => {
            if (evt.total) {
              const percent = Math.floor((evt.loaded / evt.total) * 100);
              onProgress({ 
                loaded: 10 + (percent * 0.4), // Scale 0-100 to 10-50% overall
                total: 100, 
                phase: `Git: ${evt.phase} (${percent}%)` 
              });
            } else {
              onProgress({ loaded: 30, total: 100, phase: `Git: ${evt.phase} (${evt.loaded})` });
            }
          },
        });
        cloneSuccess = true;
        break;
      } catch (err) {
        console.warn(`[GitHub Importer] Clone attempt ${attempt} failed:`, err);
        lastError = err;
        // Wait 2 seconds before retrying
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    if (!cloneSuccess) {
      throw new Error(`Failed to clone after 3 attempts. Last error: ${lastError.message}`);
    }

    onProgress({ loaded: 50, total: 100, phase: 'Extracting files...' });

    // 2. Traverse the filesystem to build a list of files with their content
    const filesToSave = [];

    async function walk(currentPath, relativePath = '') {
      const entries = await pfs.readdir(currentPath);
      for (const entry of entries) {
        // Skip git history in production to prevent massive IDB payloads
        if (!import.meta.env.DEV && entry === '.git') continue;

        const fullPath = `${currentPath}/${entry}`;
        const relPath = relativePath ? `${relativePath}/${entry}` : entry;
        const stat = await pfs.stat(fullPath);

        if (stat.isDirectory()) {
          await walk(fullPath, relPath);
        } else {
          if (filesToSave.length % 50 === 0) {
            onProgress({ loaded: 50, total: 100, phase: 'Extracting files...', currentFile: relPath });
          }
          const contentBytes = await pfs.readFile(fullPath);
          if (relPath.startsWith('.git/')) {
            // Keep git internals as binary to prevent packfile corruption
            filesToSave.push({ path: relPath, content: contentBytes });
          } else {
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
