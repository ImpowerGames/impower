import { TextEdit } from "vscode-languageserver";
import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";

// Minimal contiguous changed span between two texts (in `newText`
// coordinates), via a common-prefix / common-suffix scan. Returns null
// when the texts are identical.
//
// Used to drive incremental (delta) formatting: `oldText` is the LAST
// FORMATTED output, `newText` is the current document. Outside the
// returned span the two are byte-identical — and since `oldText` was a
// formatted output, those outside regions are already correctly
// formatted, so reformatting only the span (expanded to construct
// boundaries inside getDocumentFormattingEdits) is equivalent to a full
// format. This safety holds regardless of how `newText` was produced, as
// long as `oldText` was genuinely a format output.
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

// Apply a set of formatting TextEdits to a document's text, returning the
// resulting string. Edits are applied in reverse offset order so earlier
// edits don't shift later offsets — mirroring how an editor materializes
// them. Used to compute the formatted output to cache as the next
// diff baseline.
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
