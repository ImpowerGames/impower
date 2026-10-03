// Pinned Luau DenseHashSet<ModuleName> iteration for the test oracle target:
// Emscripten 4.0.10 wasm32, libc++ std::hash<string> (Murmur2). This is not a
// claim about other native standard libraries' implementation-defined hashes.
function moduleNameHash(name: string): number {
  const bytes = new TextEncoder().encode(name);
  const multiplier = 0x5bd1e995;
  let hash = bytes.length,
    offset = 0;
  while (offset + 4 <= bytes.length) {
    let word =
      bytes[offset]! |
      (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 3]! << 24);
    word = Math.imul(word, multiplier);
    word ^= word >>> 24;
    word = Math.imul(word, multiplier);
    hash = Math.imul(hash, multiplier) ^ word;
    offset += 4;
  }
  const remaining = bytes.length - offset;
  if (remaining >= 3) hash ^= bytes[offset + 2]! << 16;
  if (remaining >= 2) hash ^= bytes[offset + 1]! << 8;
  if (remaining >= 1) {
    hash ^= bytes[offset]!;
    hash = Math.imul(hash, multiplier);
  }
  hash ^= hash >>> 13;
  hash = Math.imul(hash, multiplier);
  return (hash ^ (hash >>> 15)) >>> 0;
}

/** Ascending occupied buckets, as pinned DenseHashSet::begin/iterator. */
export function pinnedModuleDependencyOrder(names: Iterable<string>): string[] {
  let buckets: (string | undefined)[] = [];
  const inserted = new Set<string>();
  const place = (name: string) => {
    // DenseHash::doHash mixes even the wasm32 hash through a uint64 product.
    const hash =
      (BigInt(moduleNameHash(name)) * 11400714819323198485n) &
      0xffffffffffffffffn;
    let bucket = Number(hash >> BigInt(64 - Math.log2(buckets.length)));
    while (buckets[bucket] !== undefined)
      bucket = (bucket + 1) % buckets.length;
    buckets[bucket] = name;
  };
  for (const name of names) {
    if (inserted.has(name)) continue;
    // DenseHash grows before a new insertion at 3/4 capacity, rehashing
    // existing elements in ascending occupied-bucket order.
    if (inserted.size >= (buckets.length * 3) / 4) {
      const previous = buckets;
      buckets = new Array(previous.length === 0 ? 16 : previous.length * 2);
      for (const old of previous) if (old !== undefined) place(old);
    }
    place(name);
    inserted.add(name);
  }
  return buckets.filter((name): name is string => name !== undefined);
}
