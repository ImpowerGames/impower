// The flows a compile served from the serialized-flow cache.
//
// A flow served from the cache and a flow rebuilt from scratch compile to the
// same bytes, so the compiled output alone cannot show that reuse happened,
// and `computeFlowReuse` only says which flows may be served, not whether the
// cache held them. A served flow's cache entry holds the very value the
// previous compile cached, so value identity tells the two apart. A test
// captures `previous` (the compiler's `_flowJsonCache`) in a `computeFlowReuse`
// override, which runs before the compile replaces the cache, and passes the
// replaced cache as `current` once the compile is done.
export function servedFlowNames(
  current: ReadonlyMap<string, { value: unknown }> | undefined,
  previous: ReadonlyMap<string, { value: unknown }> | undefined,
): string[] {
  const served: string[] = [];
  for (const [name, entry] of current ?? []) {
    if (previous?.get(name)?.value === entry.value) {
      served.push(name);
    }
  }
  return served;
}
