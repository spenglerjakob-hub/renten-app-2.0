/** Bewegung reduzieren? Dann ohne Animation, ohne sanftes Scrollen und ohne Wartezeiten. */
export function ruhig(): boolean {
  return typeof window !== 'undefined'
    && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
}
