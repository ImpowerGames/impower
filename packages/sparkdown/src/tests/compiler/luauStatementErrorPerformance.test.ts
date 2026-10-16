import { expect, test, vi } from "vitest";
import { Text } from "@codemirror/state";
import type { SyntaxNode, Tree } from "@lezer/common";
import { SparkdownCombinedAnnotator } from "../../compiler/classes/SparkdownCombinedAnnotator";
import { parseSource } from "./grammarSnapshot";
import { luauStatementError } from "../../compiler/utils/luauStatementError";

// The first name of each `Hello there` line: the statement candidate a define
// body reports (`reportDefineStatement`).
function candidates(node: SyntaxNode, source: string, result: SyntaxNode[] = []): SyntaxNode[] {
  if (node.name === "LuauAccessPath") {
    if (source.slice(node.from, node.to).trim() === "Hello") result.push(node);
  } else for (let child = node.firstChild; child; child = child.nextSibling) candidates(child, source, result);
  return result;
}

// Count actual source reads and tree-navigation operations, rather than a
// timing threshold that changes with machine load. Keep token/range assertions
// alongside the work bound so skipping diagnostics cannot make this pass.
function measure(count: number, oneFunction: boolean) {
  const source = oneFunction
    ? `function f()\n${"  Hello there\n".repeat(count)}end\n`
    : Array.from({ length: count }, (_, i) => `function f${i}()\n  Hello there\nend\n`).join("");
  const nodes = candidates(parseSource(source).topNode, source);
  expect(nodes.length).toBe(count);
  let navigation = 0;
  let readUnits = 0;
  let documentLoads = 0;
  let newlineSearches = 0;
  let cached: string | undefined;
  const proxies = new WeakMap<SyntaxNode, SyntaxNode>();
  const wrap = (node: SyntaxNode): SyntaxNode => {
    let proxy = proxies.get(node);
    if (!proxy) {
      proxy = new Proxy(node, {
        get(target, key) {
          if (["parent", "firstChild", "nextSibling"].includes(String(key))) {
            navigation++;
            const child = Reflect.get(target, key, target) as SyntaxNode | null;
            return child ? wrap(child) : null;
          }
          return Reflect.get(target, key, target);
        },
      });
      proxies.set(node, proxy);
    }
    return proxy;
  };
  const indexOf = String.prototype.indexOf;
  const scan = vi.spyOn(String.prototype, "indexOf").mockImplementation(function (this: string, search: string, position?: number) {
    if (search === "\n") newlineSearches++;
    return indexOf.call(this, search, position);
  });
  try {
    for (const node of nodes) {
      const line = source.slice(node.from, node.to);
      const from = node.from + line.length - line.trimStart().length;
      const result = luauStatementError(
        wrap(node), from,
        (a, b) => {
          const text = source.slice(a, b);
          readUnits += text.length;
          return text;
        }, source.indexOf("\n", node.to),
        () => {
          if (cached === undefined) { documentLoads++; cached = source; }
          return cached;
        },
      );
      expect(result).toEqual({
        message: "Incomplete statement: expected assignment or a function call",
        from, to: from + 5,
      });
    }
  } finally { scan.mockRestore(); }
  return { count, sourceUnits: source.length, readUnits, navigation, newlineSearches, documentLoads };
}

test.each([32, 64, 128])("%i distributed invalid statements do bounded work", (count) => {
  const work = measure(count, false);
  console.log("statement diagnostic work", JSON.stringify(work));
  expect(work.readUnits).toBeLessThan(count * 600);
  expect(work.navigation).toBeLessThan(count * 100);
  expect(work.newlineSearches).toBeLessThan(count * 12);
  expect(work.documentLoads).toBe(1);
});

test("many invalid siblings do not repeatedly walk the beginning of their enclosing body", () => {
  const work = measure(128, true);
  console.log("statement diagnostic sibling work", JSON.stringify(work));
  expect(work.readUnits).toBeLessThan(work.count * 600);
  expect(work.navigation).toBeLessThan(work.count * 100);
  expect(work.newlineSearches).toBeLessThan(work.count * 12);
  expect(work.documentLoads).toBe(1);
});

class WindowProbe extends SparkdownCombinedAnnotator {
  window(tree: Tree, text: Text, from: number, to: number) {
    return this.validationWindow(tree, text, from, to);
  }
}

test.each([64, 128, 256])("a validation window crossing %i comment lines reads the document once", (count) => {
  const source = `function f()\n  local x = 1\n${"  -- comment\n".repeat(count)}  local y = 2\nend\n`;
  const text = Text.of(source.split("\n"));
  const tree = parseSource(source);
  const slice = text.sliceString.bind(text);
  let fullReads = 0;
  let readUnits = 0;
  const reads = vi.spyOn(text, "sliceString").mockImplementation((from, to = text.length) => {
    const result = slice(from, to);
    readUnits += result.length;
    if (from === 0 && to >= text.length) fullReads++;
    return result;
  });
  let newlineSearches = 0;
  const indexOf = String.prototype.indexOf;
  const scan = vi.spyOn(String.prototype, "indexOf").mockImplementation(function (this: string, search: string, position?: number) {
    if (search === "\n") newlineSearches++;
    return indexOf.call(this, search, position);
  });
  try {
    const from = source.indexOf("local y");
    expect(new WindowProbe().window(tree, text, from, from + "local y = 2".length)).toEqual({ from: 0, to: source.lastIndexOf("end") + 3 });
    console.log("validation window work", JSON.stringify({ count, sourceUnits: source.length, readUnits, fullReads, newlineSearches }));
    expect(readUnits).toBeLessThan(count * 100);
    expect(fullReads).toBe(1);
    expect(newlineSearches).toBeLessThan(count * 3);
  } finally { reads.mockRestore(); scan.mockRestore(); }
});
