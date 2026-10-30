import { cachedCompilerProp } from "@impower/textmate-grammar-tree/src/tree/props/cachedCompilerProp";
import { describe, expect, it } from "vitest";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";

const URI = "inmemory:///main.sd";

let nextVersion = 2;

function posAt(text: string, offset: number) {
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < offset; i++) {
    if (text[i] === "\n") {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, character: offset - lineStart };
}

function open(text: string) {
  const registry = new SparkdownDocumentRegistry(["formatting"]);
  registry.add({
    textDocument: { uri: URI, text, version: 1, languageId: "sparkdown" },
  });
  return registry;
}

function snapshot(registry: SparkdownDocumentRegistry) {
  const annotations = registry.annotations(URI) as Record<string, any>;
  const out: string[] = [];
  const iter = annotations["formatting"]!.iter(0);
  while (iter.value) {
    out.push(`${iter.from}-${iter.to} ${JSON.stringify(iter.value.type)}`);
    iter.next();
  }
  return out;
}

function fixture(table: string) {
  const lines: string[] = [];
  for (let i = 0; i < 40; i++) {
    lines.push(`local pad_${i} = ${i} + 1`);
  }
  lines.push(`local t = ${table}`);
  for (let i = 0; i < 40; i++) {
    lines.push(`local post_${i} = ${i} + 1`);
  }
  lines.push("");
  return lines.join("\n");
}

function expectEditMatchesCold(
  table: string,
  editAt: (text: string) => number,
  deleteCount: number,
  inserted: string,
) {
  let text = fixture(table);
  const incremental = open(text);
  const offset = editAt(text);
  const start = posAt(text, offset);
  const end = posAt(text, offset + deleteCount);
  incremental.update({
    textDocument: { uri: URI, version: nextVersion++ },
    contentChanges: [{ range: { start, end }, text: inserted }],
  });
  text = text.slice(0, offset) + inserted + text.slice(offset + deleteCount);
  const cached: any = incremental.tree(URI)?.prop(cachedCompilerProp as any);
  expect(cached?.reparsedFrom ?? 0).toBeGreaterThan(0);
  const cold = open(text);
  expect(incremental.tree(URI)!.toString()).toBe(cold.tree(URI)!.toString());
  expect(snapshot(incremental)).toEqual(snapshot(cold));
}

describe("table brace formatting marks after an incremental edit", () => {
  it("match a cold parse after an edit inside a one-line table", () => {
    expectEditMatchesCold(
      "{ a = 1, b = 2 }",
      (text) => text.indexOf("b = 2") + 4,
      0,
      "3",
    );
  });

  it("match a cold parse after a line break splits a one-line table", () => {
    expectEditMatchesCold(
      "{ a = 1, b = 2 }",
      (text) => text.indexOf("b = 2"),
      0,
      "\n  ",
    );
  });

  it("match a cold parse after an edit empties a one-line table", () => {
    expectEditMatchesCold(
      "{ a }",
      (text) => text.indexOf("{ a }") + 2,
      1,
      "",
    );
  });

  it("match a cold parse after an edit joins a multi-line table", () => {
    expectEditMatchesCold(
      "{\n  a = 1 }",
      (text) => text.indexOf("{\n") + 1,
      3,
      " ",
    );
  });
});
