import { expect, test, vi } from "vitest";
import { Text } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import { ValidationAnnotator } from "../../compiler/classes/annotators/ValidationAnnotator";
import { parseSource } from "./grammarSnapshot";
import { luauStatementError } from "../../compiler/utils/luauStatementError";

function candidates(node: SyntaxNode, result: SyntaxNode[] = []): SyntaxNode[] {
  if (node.name === "LuauInvalidStatement") result.push(node);
  else for (let child = node.firstChild; child; child = child.nextSibling) candidates(child, result);
  return result;
}

// Count actual source reads and tree-navigation operations, rather than a
// timing threshold that changes with machine load. Keep token/range assertions
// alongside the work bound so skipping diagnostics cannot make this pass.
function measure(count: number, oneFunction: boolean) {
  const source = oneFunction
    ? `function f()\n${"  Hello there\n".repeat(count)}end\n`
    : Array.from({ length: count }, (_, i) => `function f${i}()\n  Hello there\nend\n`).join("");
  const nodes = candidates(parseSource(source).topNode);
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
        }, node.to,
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

test("validation converts an immutable document once and refreshes it on replacement and edits", () => {
  const annotator = new ValidationAnnotator();
  for (const source of [
    "function f()\n  Hello there\nend\n",
    "-- 😀\nfunction g()\n  Hello there\nend\n",
    // Same length and position as the preceding document, different token
    // and range. Tree shape/length cannot identify the cached source text.
    "-- 😀\nfunction g()\n  $1234 there\nend\n",
    "function f()\n  Hello there\nend\n",
  ]) {
    const tree = parseSource(source);
    const text = Text.of(source.split("\n"));
    const stringify = vi.spyOn(text, "toString");
    annotator.update(tree, text);
    for (let repeat = 0; repeat < 2; repeat++) {
      annotator.update(tree, text);
      const node = candidates(tree.topNode)[0]!;
      expect(node).toBeDefined();
      const result = annotator.enter([], node as never);
      const from = source.indexOf(source.includes("$1234") ? "$1234" : "Hello");
      const expected = luauStatementError(node, from, (a, b) => source.slice(a, b), node.to);
      expect(expected).not.toBeNull();
      expect(result.map((range) => ({ from: range.from, to: range.to, message: range.value.type.message }))).toEqual([expected]);
    }
    expect(stringify).toHaveBeenCalledTimes(1);
    stringify.mockRestore();
  }
});
