// Protects the archive against a broken or truncated source response.
export const MIN_RATIO_OF_PREVIOUS = 0.5;

export function checkImportSize(fetchedCount, previousCount) {
  if (fetchedCount === 0) return 'Source returned no assemblies; import aborted.';
  if (previousCount > 0 && fetchedCount < previousCount * MIN_RATIO_OF_PREVIOUS) {
    return `Source returned ${fetchedCount} assemblies, less than ${MIN_RATIO_OF_PREVIOUS * 100}% of the previous run (${previousCount}); import aborted.`;
  }
  return null;
}
