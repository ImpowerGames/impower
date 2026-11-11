const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export const textFingerprint = (text: string): string => {
  let hash = FNV_OFFSET;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return `${text.length}:${(hash >>> 0).toString(16)}`;
};

export interface InsertedText {
  from: number;
  to: number;
  text: string;
}

export const FIX_SNAPSHOT_PROOFS = {
  openEditor: {
    route: "A fix applied in the editor that holds the script",
    proves:
      "The editor's synced text is the snapshot the server's offsets belong to, and nothing typed since touches a span the fix replaces",
    holds: (input: {
      fixVersion: number | undefined;
      editorVersion: number | undefined;
      touched: boolean;
    }) =>
      input.fixVersion != null &&
      input.fixVersion === input.editorVersion &&
      !input.touched,
  },
  undoInEditor: {
    route: "Undo in the editor that applied the fix",
    proves:
      "The text the fix put in is still where the fix put it, after rebasing over later edits",
    holds: (input: { text: string; inserted: readonly InsertedText[] }) =>
      input.inserted.every(
        ({ from, to, text }) =>
          from <= to &&
          to <= input.text.length &&
          input.text.slice(from, to) === text,
      ),
  },
  undoElsewhere: {
    route: "Undo in an editor that did not apply the fix, the script having been reopened",
    proves: "The script is exactly the text the fix produced",
    holds: (input: { text: string; after: string }) =>
      textFingerprint(input.text) === input.after,
  },
  outlineScope: {
    route: "An outline row's problems stamped with a published version",
    proves: "The row's diagnostics are the ones published with that version",
    holds: (input: { row: readonly unknown[]; published: readonly unknown[] }) => {
      const published = new Set(input.published);
      return input.row.every((diagnostic) => published.has(diagnostic));
    },
  },
} as const;

export type FixSnapshotRoute = keyof typeof FIX_SNAPSHOT_PROOFS;
