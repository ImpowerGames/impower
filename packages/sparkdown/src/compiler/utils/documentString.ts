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
