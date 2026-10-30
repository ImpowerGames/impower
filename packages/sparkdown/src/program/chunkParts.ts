import type { ProgramChunk } from "./ProgramChunk";

export interface ChunkPart {
  readonly fingerprint: string;
  readonly symbol: number;
  readonly block: number;
}

export interface ChunkParts {
  readonly functions: readonly ChunkPart[];
  readonly alternators: readonly ChunkPart[];
  readonly choices: readonly ChunkPart[];
  readonly heads: readonly ChunkPart[];
}

export type ChunkPartKind = keyof ChunkParts;

const CHUNK_PART_KINDS: readonly ChunkPartKind[] = [
  "functions",
  "alternators",
  "choices",
  "heads",
];

const parts = new WeakMap<ProgramChunk, ChunkParts>();

const copyParts = (list: readonly Partial<ChunkPart>[] | undefined): ChunkPart[] =>
  (list ?? []).map(({ fingerprint, symbol, block }) => ({
    fingerprint: fingerprint ?? "",
    symbol: symbol ?? -1,
    block: block ?? -1,
  }));

export const recordChunkParts = (
  chunk: ProgramChunk,
  record: {
    functions: readonly Partial<ChunkPart>[];
    alternators: readonly Partial<ChunkPart>[];
    choices: readonly Partial<ChunkPart>[];
    heads?: readonly Partial<ChunkPart>[];
  },
): void => {
  if (!parts.has(chunk)) {
    parts.set(chunk, {
      functions: copyParts(record.functions),
      alternators: copyParts(record.alternators),
      choices: copyParts(record.choices),
      heads: copyParts(record.heads),
    });
  }
};

export const chunkPartsOf = (chunk: ProgramChunk): ChunkParts | undefined =>
  parts.get(chunk);

export const partOfBlock = (
  chunk: ProgramChunk,
  block: number,
): { kind: ChunkPartKind; index: number } | undefined => {
  const recorded = parts.get(chunk);
  if (!recorded) {
    return undefined;
  }
  for (const kind of CHUNK_PART_KINDS) {
    const index = recorded[kind].findIndex((part) => part.block === block);
    if (index >= 0) {
      return { kind, index };
    }
  }
  return undefined;
};

export type HandedOn = "aligned" | "aligned-moved" | "between" | "new";

export const alignParts = (
  now: readonly string[],
  was: readonly string[],
): { pairs: (number | undefined)[]; how: (HandedOn | undefined)[] } => {
  const pairs: (number | undefined)[] = now.map(() => undefined);
  const how: (HandedOn | undefined)[] = now.map(() => undefined);
  const taken = new Set<number>();
  let from = 0;
  now.forEach((fingerprint, i) => {
    for (let o = from; o < was.length; o += 1) {
      if (was[o] === fingerprint) {
        pairs[i] = o;
        how[i] = "aligned";
        taken.add(o);
        from = o + 1;
        return;
      }
    }
  });
  now.forEach((fingerprint, i) => {
    if (pairs[i] !== undefined) {
      return;
    }
    const o = was.findIndex((w, k) => w === fingerprint && !taken.has(k));
    if (o >= 0) {
      pairs[i] = o;
      how[i] = "aligned-moved";
      taken.add(o);
    }
  });
  let lastOld = -1;
  for (let i = 0; i < now.length; i += 1) {
    if (pairs[i] !== undefined) {
      lastOld = Math.max(lastOld, pairs[i]!);
      continue;
    }
    for (let o = lastOld + 1; o < was.length; o += 1) {
      if (taken.has(o)) {
        break;
      }
      pairs[i] = o;
      how[i] = "between";
      taken.add(o);
      lastOld = o;
      break;
    }
  }
  return { pairs, how };
};
