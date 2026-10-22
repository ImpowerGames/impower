// An editor over a document registry, and the check that its incrementally
// updated tree and annotations are what a cold parse of the same text gives.
import { expect } from "vitest";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";

const sets = ["declarations", "references", "semantics"] as const;

/** A registry holding `text` at `uri`, annotated with the sets the parity check compares. */
export function openRegistry(uri: string, text: string) {
  const registry = new SparkdownDocumentRegistry([...sets]);
  registry.add({ textDocument: { uri, text, version: 1, languageId: "sparkdown" } });
  return registry;
}

function position(text: string, offset: number) {
  const prefix = text.slice(0, offset).split("\n");
  return { line: prefix.length - 1, character: prefix.at(-1)!.length };
}

function snapshot(registry: SparkdownDocumentRegistry, uri: string) {
  return sets.flatMap((key) => {
    const result: string[] = [];
    const iter = registry.annotations(uri)![key]!.iter();
    while (iter.value) {
      result.push(`${key}:${iter.from}:${iter.to}:${JSON.stringify(iter.value.type)}`);
      iter.next();
    }
    return result;
  });
}

/** Expects the registry's tree and annotations at `uri` to be those of a cold parse of `text`. */
export function expectParity(registry: SparkdownDocumentRegistry, uri: string, text: string, label: string) {
  const cold = openRegistry(uri, text);
  expect(registry.tree(uri)!.toString(), `${label}: parse trees`).toBe(cold.tree(uri)!.toString());
  const actual = snapshot(registry, uri);
  const expected = snapshot(cold, uri);
  expect({ extra: actual.filter((value) => !expected.includes(value)), missing: expected.filter((value) => !actual.includes(value)) }, label).toEqual({ extra: [], missing: [] });
}

/** Applies edits to the document at `uri` as an editor sends them, keeping its text. */
export class Editor {
  version = 2;
  constructor(public registry: SparkdownDocumentRegistry, public uri: string, public text: string) {}
  replace(from: number, to: number, insert: string) {
    const range = { start: position(this.text, from), end: position(this.text, to) };
    this.registry.update({ textDocument: { uri: this.uri, version: this.version++ }, contentChanges: [{ range, text: insert }] });
    this.text = this.text.slice(0, from) + insert + this.text.slice(to);
  }
}
