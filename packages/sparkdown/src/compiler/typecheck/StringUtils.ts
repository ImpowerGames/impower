// String helpers, ported from Luau's `Common/src/StringUtils.cpp`; Luau is
// MIT-licensed (see `LICENSE-luau.txt`).

/**
 * The Damerau-Levenshtein distance between two strings (Luau's
 * `editDistance`): insertions, deletions, substitutions and transpositions of
 * adjacent characters each cost one.
 */
export function editDistance(a: string, b: string): number {
  // When there are matching prefix and suffix, they end up computing as zero
  // cost, effectively making it no-op. We drop these characters.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  a = a.slice(start);
  b = b.slice(start);
  let end = 0;
  while (end < a.length && end < b.length && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  a = a.slice(0, a.length - end);
  b = b.slice(0, b.length - end);

  // Since we know the edit distance is the difference of the length of A and
  // B discounting the matching prefixes and suffixes, it is therefore
  // pointless to run the rest of this function to find that out.
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const maxDistance = a.length + b.length;
  const distances = new Array<number>((a.length + 2) * (b.length + 2)).fill(0);
  const getPos = (x: number, y: number) => x * (b.length + 2) + y;

  distances[0] = maxDistance;
  for (let x = 0; x <= a.length; ++x) {
    distances[getPos(x + 1, 0)] = maxDistance;
    distances[getPos(x + 1, 1)] = x;
  }
  for (let y = 0; y <= b.length; ++y) {
    distances[getPos(0, y + 1)] = maxDistance;
    distances[getPos(1, y + 1)] = y;
  }

  const seenCharToRow = new Map<string, number>();
  for (let x = 1; x <= a.length; ++x) {
    let lastMatchedY = 0;
    for (let y = 1; y <= b.length; ++y) {
      const x1 = seenCharToRow.get(b[y - 1]!) ?? 0;
      const y1 = lastMatchedY;

      let cost = 1;
      if (a[x - 1] === b[y - 1]) {
        cost = 0;
        lastMatchedY = y;
      }

      const transposition = distances[getPos(x1, y1)]! + (x - x1 - 1) + 1 + (y - y1 - 1);
      const substitution = distances[getPos(x, y)]! + cost;
      const insertion = distances[getPos(x, y + 1)]! + 1;
      const deletion = distances[getPos(x + 1, y)]! + 1;
      distances[getPos(x + 1, y + 1)] = Math.min(insertion, deletion, substitution, transposition);
    }
    seenCharToRow.set(a[x - 1]!, x);
  }

  return distances[getPos(a.length + 1, b.length + 1)]!;
}
