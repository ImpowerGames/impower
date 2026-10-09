// #1761: an incremental update applies each change to the CodeMirror `Text`
// of the version before, rather than split the whole document into lines
// again, and the `Text` it keeps must equal a fresh one of the document.
import { expect, test, vi } from "vitest";
import { Text } from "@codemirror/state";
import type { TextDocumentContentChangeEvent } from "vscode-languageserver-textdocument";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";
import { documentString } from "../../compiler/utils/documentString";

const block = (i: number) =>
  `function f${i}()\n  local x${i} = ${i}\n  return x${i}\nend\n\nThe hero walks on, ${i} steps.\n\n`;

function position(source: string, at: number) {
  const line = Text.of(source.split("\n")).lineAt(at);
  return { line: line.number - 1, character: at - line.from };
}

function keptText(registry: SparkdownDocumentRegistry, uri: string): Text {
  return (registry as unknown as { _documentStates: Map<string, { text?: Text }> })._documentStates.get(uri)!.text!;
}

/** Lines given to `Text.of` while one edit at the bottom of `count` blocks is applied. */
function linesSplitOnEdit(count: number) {
  const uri = `inmemory:///incremental-text-${count}.sd`;
  const source = Array.from({ length: count }, (_, i) => block(i)).join("");
  const registry = new SparkdownDocumentRegistry([]);
  registry.add({ textDocument: { uri, text: source, version: 1, languageId: "sparkdown" } });
  const end = position(source, source.length);
  let lines = 0;
  const of = Text.of.bind(Text);
  const spy = vi.spyOn(Text, "of").mockImplementation((text: readonly string[]) => {
    lines += text.length;
    return of(text);
  });
  try {
    registry.update({ textDocument: { uri, version: 2 }, contentChanges: [{
      range: { start: end, end }, text: "x",
    }] });
  } finally {
    spy.mockRestore();
  }
  return lines;
}

test("an edit to a long document does not split the whole document into lines", () => {
  const short = linesSplitOnEdit(10);
  const long = linesSplitOnEdit(400);
  expect(long).toBeLessThanOrEqual(short);
  expect(long).toBeLessThan(10);
});

// A small seeded generator, so a failure names a reproducible sequence.
function random(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

test("the kept text equals a fresh one after every shape of edit", () => {
  const uri = "inmemory:///incremental-text-parity.sd";
  const registry = new SparkdownDocumentRegistry([]);
  let doc = Array.from({ length: 6 }, (_, i) => block(i)).join("");
  registry.add({ textDocument: { uri, text: doc, version: 1, languageId: "sparkdown" } });
  let version = 1;
  const check = () => {
    const kept = keptText(registry, uri);
    expect(kept.eq(Text.of(doc.split("\n")))).toBe(true);
    expect(documentString(kept)).toBe(doc);
    expect(documentString(kept)).toBe(registry.get(uri)!.getText());
  };
  const apply = (changes: TextDocumentContentChangeEvent[], expected: string) => {
    registry.update({ textDocument: { uri, version: ++version }, contentChanges: changes });
    doc = expected;
    check();
  };
  const edit = (from: number, to: number, insert: string) =>
    apply(
      [{ range: { start: position(doc, from), end: position(doc, to) }, text: insert }],
      doc.slice(0, from) + insert.replace(/\r\n|\r/g, "\n") + doc.slice(to),
    );

  edit(0, 0, "Start\n");
  edit(doc.length, doc.length, "\nEnd");
  edit(0, 3, "");
  edit(doc.length - 2, doc.length, "");
  edit(5, 5, "");
  edit(10, 40, "one\r\ntwo\nthree");
  edit(2, doc.indexOf("\n", 30), "");

  // Several changes in one update, each relative to the document after the last.
  let multi = doc;
  const changes: TextDocumentContentChangeEvent[] = [];
  for (const shape of [(): [number, number, string] => [0, 1, "A\n"], (): [number, number, string] => [8, 20, ""], (): [number, number, string] => [multi.length - 25, multi.length - 5, "\n\nz"]]) {
    const [from, to, insert] = shape();
    changes.push({ range: { start: position(multi, from), end: position(multi, to) }, text: insert });
    multi = multi.slice(0, from) + insert + multi.slice(to);
  }
  apply(changes, multi);

  const next = random(1761);
  const inserts = ["", "a", "\n", "\n\n", "x\ny", "The hero.\n", "  local q = 1\n"];
  for (let i = 0; i < 60; i++) {
    const from = Math.floor(next() * (doc.length + 1));
    const to = Math.min(doc.length, from + Math.floor(next() * 30));
    edit(from, to, inserts[Math.floor(next() * inserts.length)]!);
  }

  // A whole-document replace.
  apply([{ text: "Replaced\nentirely" }], "Replaced\nentirely");
  edit(doc.length, doc.length, "\n");
});
