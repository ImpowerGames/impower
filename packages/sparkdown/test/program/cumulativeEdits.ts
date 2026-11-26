export interface CumulativeEdit {
  offset: number;
  end: number;
  insert: string;
  deleted: number;
}

export function cumulativeEdits(seed: number, inserts: readonly string[]) {
  let state = seed;
  const rand = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
  let undo: { offset: number; length: number; text: string } | undefined;
  return {
    next(text: string): CumulativeEdit {
      let insert = inserts[Math.floor(rand() * inserts.length)]!;
      let deleted = rand() < 0.4 ? 1 + Math.floor(rand() * 10) : 0;
      let offset = Math.floor(rand() * text.length);
      if (undo) {
        ({ offset, length: deleted, text: insert } = undo);
      }
      const end = Math.min(offset + deleted, text.length);
      undo = { offset, length: insert.length, text: text.slice(offset, end) };
      return { offset, end, insert, deleted };
    },
    built(chunked: boolean): void {
      if (chunked) {
        undo = undefined;
      }
    },
  };
}
