import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { type CompletionItem } from "vscode-languageserver";
import { getCompletions } from "../../utils/providers/getCompletions";

// Completion at a `|` cursor in a brace body, and the document an accepted
// item leaves, for the brace-body completion tests (#1228).

const URI = "file:///complete.sd";

export function cursorAt(source: string) {
  const idx = source.indexOf("|");
  const text = source.replace("|", "");
  const before = source.slice(0, idx);
  const position = {
    line: before.split("\n").length - 1,
    character: idx - (before.lastIndexOf("\n") + 1),
  };
  return { text, offset: idx, position };
}

export function completeAt(
  source: string,
  program: any,
  triggerCharacter?: string,
): CompletionItem[] {
  const { text, position } = cursorAt(source);
  const documents = new SparkdownDocumentRegistry([
    "characters",
    "declarations",
    "references",
  ]);
  documents.set({
    textDocument: { uri: URI, text, version: 1, languageId: "sparkdown" },
  });
  const scripts = new Map([
    [
      URI,
      {
        annotations: documents.annotations(URI),
        tree: documents.tree(URI),
        read: (from: number, to: number) => documents.get(URI)!.read(from, to),
      },
    ],
  ]);
  return (
    getCompletions(
      documents.get(URI),
      documents.tree(URI),
      scripts,
      program,
      undefined,
      position,
      triggerCharacter ? { triggerKind: 2, triggerCharacter } : undefined,
    ) ?? []
  );
}

/** The text an item inserts, with its snippet's final tab stop removed. */
export function insertedText(item: CompletionItem): string {
  const text =
    item.textEdit && "newText" in item.textEdit
      ? item.textEdit.newText
      : (item.insertText ?? String(item.label));
  return text.replace(/\$0/g, "");
}

/**
 * The document after accepting `item` at the cursor, and where the snippet's
 * `$0` leaves the cursor. An item with a `textEdit` replaces its range; an item
 * with only `insertText` replaces the word before the cursor, as both editors
 * do.
 */
export function accept(source: string, item: CompletionItem) {
  const { text, offset } = cursorAt(source);
  const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
  let from = offset - /[\w.%-]*$/.exec(text.slice(lineStart, offset))![0].length;
  let to = offset;
  if (item.textEdit && "range" in item.textEdit) {
    const lines = text.split("\n");
    const at = (p: { line: number; character: number }) =>
      lines.slice(0, p.line).reduce((n, l) => n + l.length + 1, 0) + p.character;
    from = at(item.textEdit.range.start);
    to = at(item.textEdit.range.end);
  }
  const raw =
    item.textEdit && "newText" in item.textEdit
      ? item.textEdit.newText
      : (item.insertText ?? String(item.label));
  const stop = raw.indexOf("$0");
  const inserted = raw.replace(/\$0/g, "");
  return {
    text: text.slice(0, from) + inserted + text.slice(to),
    cursor: from + (stop >= 0 ? stop : inserted.length),
    /** The document text the item replaces. */
    replaced: text.slice(from, to),
  };
}

/** Whether every `{` in `text` has its `}`, in order (quotes skipped). */
export function bracesBalanced(text: string): boolean {
  let depth = 0;
  let quote = "";
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"') quote = ch;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

/** Whether `offset` lies between a `{` and its `}` on the same line. */
export function insideBraces(text: string, offset: number): boolean {
  const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
  let lineEnd = text.indexOf("\n", offset);
  if (lineEnd < 0) lineEnd = text.length;
  const before = text.slice(lineStart, offset);
  const after = text.slice(offset, lineEnd);
  return /\{\s*$/.test(before) && /^\s*\}/.test(after);
}
