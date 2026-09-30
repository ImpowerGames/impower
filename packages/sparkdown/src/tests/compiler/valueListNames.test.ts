import { describe, expect, test } from "vitest";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";

// A name after the `=` in a declaration's list (`x` in `local a, b = 1, x`)
// has the grammar shape of a target, but it reads `x` (#1116). The editor's
// annotators must read it that way too: no declaration in the outline or
// scope-aware completion, a read for find-references and rename, and a
// reference, not a declaration, in the semantic tokens.

const SOURCE = `function helper()
end
function f()
  local x = 5
  local a, b = 1, x
  local c, d = 1, helper
  helper()
  return b
end
`;

function annotationsFor(source: string, channel: "declarations" | "references" | "semantics") {
  const reg = new SparkdownDocumentRegistry([channel]);
  const uri = "file:///value-list.sd";
  reg.set({ textDocument: { uri, text: source, version: 1, languageId: "sparkdown" } });
  const annotations = reg.annotations(uri);
  if (!annotations) throw new Error("no annotations");
  const out: { text: string; from: number; value: any }[] = [];
  const cur = annotations[channel].iter();
  while (cur.value) {
    out.push({ text: source.slice(cur.from, cur.to).trim(), from: cur.from, value: (cur.value as any).type });
    cur.next();
  }
  return out;
}

// The offset of the `occurrence`-th whole-word `name` in `source`.
function offsetOf(source: string, name: string, occurrence: number): number {
  const matches = [...source.matchAll(new RegExp(`\\b${name}\\b`, "g"))];
  return matches[occurrence - 1]!.index!;
}

describe("a name in a declaration's value list", () => {
  test("is not a declaration", () => {
    const decls = annotationsFor(SOURCE, "declarations").map((d) => `${d.value} ${d.text}`);
    expect(decls.filter((d) => d === "var x")).toEqual(["var x"]);
    expect(decls).not.toContain("var helper");
    expect(decls).toEqual(expect.arrayContaining(["var a", "var b", "var c", "var d"]));
  });

  test("is a read reference", () => {
    const refs = annotationsFor(SOURCE, "references");
    const valueX = refs.find((r) => r.from === offsetOf(SOURCE, "x", 2));
    expect(valueX?.value.kind).toBe("read");
    expect(valueX?.value.declaration).toBeUndefined();
    const valueHelper = refs.find((r) => r.from === offsetOf(SOURCE, "helper", 2));
    expect(valueHelper?.value.kind).toBe("read");
  });

  test("is a reference in the semantic tokens and keeps what it refers to", () => {
    const tokens = annotationsFor(SOURCE, "semantics");
    const valueX = tokens.find((t) => t.from === offsetOf(SOURCE, "x", 2));
    expect(valueX?.value.tokenModifiers ?? []).not.toContain("declaration");
    // Naming `helper` in a value list does not rebind it as a variable, so
    // the call on the next line is still a function.
    const call = tokens.find((t) => t.from === offsetOf(SOURCE, "helper", 3));
    expect(call?.value.tokenType).toBe("function");
  });
});
