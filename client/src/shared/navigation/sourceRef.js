/**
 * sourceRef.js — Canonical Source Reference Model
 *
 * Single source of truth for how CodeLens represents a location inside a
 * repository's source code.  Every feature that wants to navigate to source
 * (Architecture, Engineering Health, Impact, AI, Documentation, ADR) must
 * build a SourceReference with `makeSourceRef` and navigate with
 * `buildSourceUrl` / the `useSourceNavigation` hook.
 *
 * Do NOT build `/explore/:id/source?…` URLs by hand anywhere else in the app.
 */

// ── Model ─────────────────────────────────────────────────────────────────────

/**
 * Create a validated SourceReference object.
 *
 * @param {object} opts
 * @param {string}  opts.filePath   - Forward-slash repository-relative path.
 * @param {number} [opts.startLine] - 1-based line number to scroll to.
 * @param {number} [opts.endLine]   - 1-based end of highlight range (optional).
 * @param {string} [opts.symbol]    - Symbol name (informational, not required for nav).
 * @param {object} [opts.meta]      - Any extra context (category, severity, …).
 * @returns {SourceReference}
 */
export function makeSourceRef({ filePath, startLine, endLine, symbol, meta } = {}) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('[sourceRef] filePath is required and must be a string');
  }

  const ref = {
    filePath: filePath.replace(/\\/g, '/').replace(/^\/+/, ''),
  };

  if (startLine != null) {
    const n = parseInt(startLine, 10);
    if (!isNaN(n) && n > 0) ref.startLine = n;
  }

  if (endLine != null && ref.startLine != null) {
    const n = parseInt(endLine, 10);
    if (!isNaN(n) && n >= ref.startLine) ref.endLine = n;
  }

  if (symbol && typeof symbol === 'string') ref.symbol = symbol;
  if (meta && typeof meta === 'object') ref.meta = meta;

  return ref;
}

/**
 * Try to build a SourceReference — returns null instead of throwing when the
 * input is incomplete or invalid.  Use when the reference may come from
 * untrusted / AI-generated data.
 */
export function tryMakeSourceRef(opts) {
  try {
    return makeSourceRef(opts);
  } catch {
    return null;
  }
}

// ── URL builder ───────────────────────────────────────────────────────────────

/**
 * Build the canonical Explorer URL for a SourceReference.
 *
 * @param {string}          repoId
 * @param {SourceReference} ref
 * @returns {string}  A react-router-compatible pathname+search string.
 */
export function buildSourceUrl(repoId, ref) {
  if (!repoId || !ref?.filePath) return `/explore/${repoId}/source`;

  const params = new URLSearchParams();
  params.set('path', ref.filePath);

  if (ref.startLine) {
    params.set('line', ref.endLine ? `${ref.startLine}-${ref.endLine}` : String(ref.startLine));
  }

  return `/explore/${repoId}/source?${params.toString()}`;
}

// ── Parsing helpers ───────────────────────────────────────────────────────────

/**
 * Parse a compact reference string that the AI or other text sources may emit.
 * Accepted formats:
 *   "src/app.js"
 *   "src/app.js:42"
 *   "src/app.js:42-58"
 *   "[src/app.js:42]"
 *
 * Returns null when the string cannot be parsed into a valid path.
 */
export function parseRefString(str) {
  if (!str || typeof str !== 'string') return null;
  const clean = str.replace(/^\[/, '').replace(/\]$/, '').trim();
  if (!clean) return null;

  const colonIdx = clean.lastIndexOf(':');
  let filePath = clean;
  let startLine = null;
  let endLine = null;

  if (colonIdx > 0) {
    const possibleLine = clean.slice(colonIdx + 1);
    // Only treat the part after the colon as a line spec if it looks numeric
    if (/^\d+(-\d+)?$/.test(possibleLine)) {
      filePath = clean.slice(0, colonIdx);
      const parts = possibleLine.split('-');
      startLine = parseInt(parts[0], 10);
      if (parts[1]) endLine = parseInt(parts[1], 10);
    }
  }

  return tryMakeSourceRef({ filePath, startLine, endLine });
}
