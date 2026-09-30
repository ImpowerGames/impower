// The random edits of the cumulative fuzz that runs many edits of a
// screenplay through one compiler (programDifferential's "keeps the chunks of
// a cold compile through many edits"), so that a test can replay a seed's
// edits: each inserts one of the screenplay's inserts at a random offset, and
// four times in ten deletes up to ten characters there; an edit after which
// the program fell back is undone by the next one.

export interface CumulativeEdit {
  /** Where the edit starts, where the text it replaces ends, and the text
   *  it inserts. */
  offset: number;
  end: number;
  insert: string;
  /** How many characters the edit deletes, as drawn. */
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
    /** The next edit of `text`. */
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
    /** Records whether the last edit's program built its chunks: the next
     *  edit undoes one that fell back. */
    built(chunked: boolean): void {
      if (chunked) {
        undo = undefined;
      }
    },
  };
}
