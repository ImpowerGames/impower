import { TextEdit } from "vscode-languageserver";
import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";

export function diffDirtyRange(
  oldText: string,
  newText: string,
): { from: number; to: number } | null {
  if (oldText === newText) {
    return null;
  }
  const max = Math.min(oldText.length, newText.length);
  let prefix = 0;
  while (prefix < max && oldText[prefix] === newText[prefix]) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < max - prefix &&
    oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  return { from: prefix, to: newText.length - suffix };
}

export function applyTextEdits(
  document: SparkdownDocument,
  edits: TextEdit[],
): string {
  const reverse = [...edits].sort(
    (a, b) => document.offsetAt(b.range.start) - document.offsetAt(a.range.start),
  );
  let result = document.getText();
  for (const edit of reverse) {
    const from = document.offsetAt(edit.range.start);
    const to = document.offsetAt(edit.range.end);
    result = result.slice(0, from) + edit.newText + result.slice(to);
  }
  return result;
}
