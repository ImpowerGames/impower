/** Performance measuring utility. */
export function perfy(): () => number {
  const start = performance.now();
  return () => {
    return parseFloat((performance.now() - start).toFixed(4));
  };
}
