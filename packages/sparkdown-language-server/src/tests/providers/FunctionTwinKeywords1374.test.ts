import "@impower/sparkdown/src/inkjs/engine/Container";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { getStack } from "@impower/textmate-grammar-tree/src/tree/utils/getStack";
import { expect, test } from "vitest";
import { labelsAt } from "./completionHarness";

function observedLabels(source: string, trigger?: string) {
  const offset = source.indexOf("@1");
  expect(offset).toBeGreaterThanOrEqual(0);
  const text = source.replace("@1", "");
  const registry = new SparkdownDocumentRegistry(["characters", "declarations", "references"]);
  const uri = "file:///proj/main.sd";
  registry.set({ textDocument: { uri, text, version: 1, languageId: "sparkdown" } });
  const labels = labelsAt(source, trigger ? { trigger } : undefined);
  console.log("FUNCTION KEYWORD STACK", JSON.stringify({
    source, labels,
    stack: getStack<string>(registry.tree(uri)!, offset, -1).map(node => ({
      name: node.name, from: node.from, to: node.to,
      text: text.slice(node.from, node.to),
    })),
  }));
  return labels;
}

test.each([
  ["canonical multiline", "function f()\n  @1\nend\n"],
  ["canonical same line", "function f() @1 end\n"],
  ["bounded same line", "& function f() @1 end\n"],
])("function keyword completion: %s", (_label, source) => {
  // An empty slot reaches keyword admission without an access-path prefix.
  expect(observedLabels(source!)).toContain("return");
});

test.each([
  ["nested function", "& function outer() local function inner() @1 end end\n"],
  ["anonymous initializer", "& store callback = function() @1 end\n"],
])("a bounded %s admits function keywords", (_label, source) => {
  expect(observedLabels(source!)).toContain("return");
});

test("a marked call outside a function does not admit return", () => {
  expect(observedLabels("& print(@1)\n")).not.toContain("return");
});

test.each([
  ["immediately after its closer", "& function f() end@1\n"],
  ["after a same-line separator", "& function f() end; @1\n"],
  ["inside a following marked call", "& function f() end; print(@1)\n"],
])("a closed function does not admit return %s", (_label, source) => {
  expect(observedLabels(source!)).not.toContain("return");
});

test("bounded and canonical member slots have identical labels without function keywords", () => {
  // The archived probe found score absent in both contexts. Its positive
  // contract belongs to the completion repair and must pass after composition;
  // this change preserves the existing member route without adding return.
  const source = (prefix: string) => `store data = { score = 5 }\n${prefix}function f() local value = data.@1 end\n`;
  const canonical = observedLabels(source(""), ".");
  const bounded = observedLabels(source("& "), ".");
  expect(bounded).toEqual(canonical);
  expect(canonical).not.toContain("return");
  expect(bounded).not.toContain("return");
});
