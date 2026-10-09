import { Text } from "@codemirror/state";

// The one string of each version of a document. The Luau readers find their
// caches, and the edits the registry notes (`noteLuauDocumentEdit`), by the
// document's string: one string shared by every reader of a version is
// matched by identity, where two strings of the same text are compared
// character by character.
const strings = new WeakMap<Text, string>();

/** `text` as one string, the same string each time it is asked for. */
export function documentString(text: Text): string {
  let string = strings.get(text);
  if (string === undefined) {
    string = text.toString();
    strings.set(text, string);
  }
  return string;
}

/** The `Text` of `string`, whose `documentString` is `string` itself. */
export function documentText(string: string): Text {
  const text = Text.of(string.split("\n"));
  strings.set(text, string);
  return text;
}

/**
 * The `Text` of `before` with `from`..`to` replaced by `insert`, whose
 * `documentString` is `string`, the whole document after the change. Only the
 * inserted text is split, so the cost follows the change, not the document.
 */
export function editedDocumentText(
  before: Text,
  from: number,
  to: number,
  insert: string,
  string: string,
): Text {
  const text = before.replace(from, to, Text.of(insert.split("\n")));
  strings.set(text, string);
  return text;
}
