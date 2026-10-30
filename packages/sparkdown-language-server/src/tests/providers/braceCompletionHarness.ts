import { type CompletionItem } from "vscode-languageserver";
import { complete } from "./completionHarness";

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
  return complete(source.replace("|", "@0"), {
    program,
    trigger: triggerCharacter,
  }).items;
}

export function insertedText(item: CompletionItem): string {
  const text =
    item.textEdit && "newText" in item.textEdit
      ? item.textEdit.newText
      : (item.insertText ?? String(item.label));
  return text.replace(/\$0/g, "");
}

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
    replaced: text.slice(from, to),
  };
}

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

export function insideBraces(text: string, offset: number): boolean {
  const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
  let lineEnd = text.indexOf("\n", offset);
  if (lineEnd < 0) lineEnd = text.length;
  const before = text.slice(lineStart, offset);
  const after = text.slice(offset, lineEnd);
  return /\{\s*$/.test(before) && /^\s*\}/.test(after);
}
