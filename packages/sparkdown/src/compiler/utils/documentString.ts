import { Text } from "@codemirror/state";

const strings = new WeakMap<Text, string>();

export function documentString(text: Text): string {
  let string = strings.get(text);
  if (string === undefined) {
    string = text.toString();
    strings.set(text, string);
  }
  return string;
}

export function documentText(string: string): Text {
  const text = Text.of(string.split("\n"));
  strings.set(text, string);
  return text;
}

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
