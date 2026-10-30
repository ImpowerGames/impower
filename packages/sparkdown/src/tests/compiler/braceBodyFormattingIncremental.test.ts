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

function fixture() {
  const lines: string[] = [];
  for (let i = 0; i < 40; i++) {
    lines.push(`store pad_${i} = ${i}`);
  }
  lines.push(`layout hud with
  column.panel #gap=4 {
    row { text "a"; text "b" }
    text "c" .note
    card .tag
    button @click={ pad_1 = 2 } "Go"
    style_me = { width = 1 }
  }
end

style panel with
  &.wide { width = 100% }
end
`);
  return lines.join("\n");
}

function expectEditMatchesCold(
  editAt: (text: string) => number,
  deleteCount: number,
  inserted: string,
) {
  let text = fixture();
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

describe("brace body formatting marks after an incremental edit", () => {
  it("match a cold parse after an edit inside a one-line block", () => {
    expectEditMatchesCold((text) => text.indexOf(`"b"`) + 2, 0, "x");
  });

  it("match a cold parse after a `;` is typed between two entries", () => {
    expectEditMatchesCold((text) => text.indexOf(`; text "b"`), 1, ";;");
  });

  it("match a cold parse after a line break splits a one-line block", () => {
    expectEditMatchesCold(
      (text) => text.indexOf(`text "b" }`) + 8,
      0,
      "\n    ",
    );
  });

  it("match a cold parse after an edit empties a one-line block", () => {
    expectEditMatchesCold(
      (text) => text.indexOf(`{ width = 1 }`) + 1,
      11,
      "",
    );
  });

  it("match a cold parse after an edit inside a one-line closure", () => {
    expectEditMatchesCold((text) => text.indexOf("pad_1 = 2") + 8, 1, "3");
  });

  it("match a cold parse after an edit before a class", () => {
    expectEditMatchesCold((text) => text.indexOf(`"c"`) + 2, 0, "d");
  });

  it("match a cold parse after an element's name is renamed before its class", () => {
    expectEditMatchesCold((text) => text.indexOf("card .tag"), 4, "café");
  });

  it("match a cold parse after a call is added between a name and its class", () => {
    expectEditMatchesCold((text) => text.indexOf("card .tag") + 4, 0, "(1)");
  });

  it("match a cold parse after an edit inside a struct block", () => {
    expectEditMatchesCold((text) => text.indexOf("100%") + 1, 2, "5");
  });
});
