import { describe, expect, test } from "vitest";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { getCompletions } from "../../utils/providers/getCompletions";
import { getAnnotatedScripts } from "../../utils/annotations/getAnnotatedScripts";

const cases = [
  { name: "named define method shape", source: "define Point with\n  function inspect()\n    local t = { old = 1 }\n    return t.@1\n  end\nend\n", from: "old", to: "new", before: ["old"], after: ["new"] },
  { name: "handler shape", source: 'layout hud with\n  button "Go" @click={ local t = { old = 1 }; return t.@1 }\nend\n', from: "old", to: "new", before: ["old"], after: ["new"] },
  { name: "named define method parameter identity", source: "store t = { global = 1 }\ndefine Point with\n  function inspect(p)\n    return t.@1\n  end\nend\n", from: "inspect(p)", to: "inspect(t)", before: ["global"], after: [] },
  { name: "handler local identity", source: 'store t = { global = 1 }\nlayout hud with\n  button "Go" @click={ local q = { inner = 1 }; return t.@1 }\nend\n', from: "local q", to: "local t", before: ["global"], after: ["inner"] },
];

describe("already requested member contexts refresh after same-length edits (#867)", () => {
  test.each(cases)("$name", ({ source, from, to, before, after }) => {
    const uri = "file:///proj/main.sd";
    const cursor = source.indexOf("@1");
    expect(cursor).toBeGreaterThanOrEqual(0);
    const text = source.replace("@1", "");
    const documents = new SparkdownDocumentRegistry(["declarations", "references"]);
    documents.set({ textDocument: { uri, text, version: 1, languageId: "sparkdown" } });
    const workspace = { document: (target: string) => documents.get(target), tree: (target: string) => documents.tree(target), annotations: (target: string) => documents.annotations(target) };
    const request = () => {
      const document = documents.get(uri)!;
      return (getCompletions(document, documents.tree(uri), getAnnotatedScripts(uri, undefined, workspace), undefined, undefined, document.positionAt(cursor), undefined) ?? []).map((item) => item.label).sort();
    };
    // Actual requests populate Reading.contexts; parsing editedFrom would not.
    expect(request()).toEqual(before);
    expect(request()).toEqual(before);
    expect(from.length).toBe(to.length);
    const start = text.indexOf(from);
    expect(start).toBeGreaterThanOrEqual(0);
    const document = documents.get(uri)!;
    const range = { start: document.positionAt(start), end: document.positionAt(start + from.length) };
    documents.update({ textDocument: { uri, version: 2 }, contentChanges: [{ range, text: to }] });
    expect(documents.get(uri)!.getText()).toBe(text.slice(0, start) + to + text.slice(start + from.length));
    expect(documents.get(uri)!.getText().length).toBe(text.length);
    expect(request()).toEqual(after);
    expect(request()).toEqual(after);
    documents.update({ textDocument: { uri, version: 3 }, contentChanges: [{ range, text: from }] });
    expect(request()).toEqual(before);
  });
});
