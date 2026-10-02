/**
 * useSourceNavigation.js
 *
 * Central React hook for navigating to a source location inside the CodeLens
 * Explorer / Code Viewer.
 *
 * Usage:
 *   const { openSource, sourceUrl } = useSourceNavigation();
 *   openSource(makeSourceRef({ filePath: 'src/app.js', startLine: 42 }));
 *
 * This is the ONLY place where the explorer route path should be constructed.
 * All feature pages (Architecture, Engineering Health, Impact, AI, ADR, Docs)
 * must call this hook instead of building URLs by hand.
 */
import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { buildSourceUrl, makeSourceRef } from './sourceRef';

/**
 * @returns {{ openSource, sourceUrl }}
 */
export function useSourceNavigation() {
  const navigate = useNavigate();
  const { repoId } = useParams();

  /**
   * Navigate to the Explorer / Code Viewer at a specific source location.
   *
   * @param {import('./sourceRef').SourceReference | null} ref
   *   Pass null or omit to navigate to the Explorer root (no file selected).
   */
  const openSource = useCallback(
    ref => {
      if (!repoId) return;
      if (!ref?.filePath) {
        navigate(`/explore/${repoId}/source`);
        return;
      }
      navigate(buildSourceUrl(repoId, ref));
    },
    [navigate, repoId]
  );

  /**
   * Build the URL string for a SourceReference without navigating — useful
   * for rendering <Link> components that need an `href`.
   *
   * @param {import('./sourceRef').SourceReference | null} ref
   * @returns {string}
   */
  const sourceUrl = useCallback(
    ref => {
      if (!repoId) return '#';
      return buildSourceUrl(repoId, ref);
    },
    [repoId]
  );

  /**
   * Convenience: build a SourceReference and navigate in one call.
   *
   * @param {string}  filePath
   * @param {number} [startLine]
   * @param {number} [endLine]
   */
  const openFile = useCallback(
    (filePath, startLine, endLine) => {
      if (!filePath) return;
      try {
        const ref = makeSourceRef({ filePath, startLine, endLine });
        openSource(ref);
      } catch (err) {
        console.warn('[useSourceNavigation] Invalid source reference:', err.message);
      }
    },
    [openSource]
  );

  return { openSource, sourceUrl, openFile };
}
