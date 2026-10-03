import "../../inkjs/engine/Container";
import { expect, test, vi } from "vitest";
import { Text } from "@codemirror/state";
import type { SyntaxNode, Tree } from "@lezer/common";
import { SparkdownCombinedAnnotator } from "../../compiler/classes/SparkdownCombinedAnnotator";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";
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

test.each([64, 128, 256])("the complete validation pass bounds source reads for %i statements", (count) => {
  for (const line of ["Hello there", "Well, friend."]) {
    const source = Array.from({ length: count }, (_, i) => `function f${i}()\n  ${line}\nend\n`).join("");
    const tree = parseSource(source);
    const text = Text.of(source.split("\n"));
    const annotator = new ValidationAnnotator();
    annotator.update(tree, text);
    const slice = text.sliceString.bind(text);
    let readUnits = 0;
    let fullReads = 0;
    const reads = vi.spyOn(text, "sliceString").mockImplementation((from, to = text.length) => {
      const result = slice(from, to);
      readUnits += result.length;
      if (from === 0 && to >= text.length) fullReads++;
      return result;
    });
    const stringify = vi.spyOn(text, "toString");
    try {
      const found: Parameters<ValidationAnnotator["enter"]>[0] = [];
      tree.iterate({ enter(node) { annotator.enter(found, node as Parameters<ValidationAnnotator["enter"]>[1]); } });
      const expected = Array.from(source.matchAll(/function f\d+\(\)\n  ([^\n]+)\nend\n/g), (match) => {
        const from = match.index + (line === "Hello there" ? match[0]!.indexOf("Hello") : match[0]!.lastIndexOf("end"));
        return {
          from, to: from + (line === "Hello there" ? 5 : 3),
          message: line === "Hello there"
            ? "Incomplete statement: expected assignment or a function call"
            : "Expected identifier, got 'end'",
        };
      });
      expect(expected).toHaveLength(count);
      expect(found.map((range) => ({ from: range.from, to: range.to, message: range.value.type.message }))).toEqual(expected);
      console.log("complete validation work", JSON.stringify({ count, line, sourceUnits: source.length, readUnits, fullReads, documentLoads: stringify.mock.calls.length }));
      expect(readUnits).toBeLessThan(count * 1000);
      expect(fullReads).toBe(1);
      expect(stringify).toHaveBeenCalledTimes(1);
    } finally {
      reads.mockRestore();
      stringify.mockRestore();
    }
  }
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

test("repair and revert preserve read-ahead ownership and neighboring diagnostic positions", () => {
  const uri = "inmemory:///statement-recovery.sd";
  let source = 'function f()\n  Well, friend.\n  -- 😀 comment\n\nend\n\nfunction g()\n  Hello there\nend\n';
  const registry = new SparkdownDocumentRegistry(["validations"]);
  registry.add({ textDocument: { uri, text: source, version: 1, languageId: "sparkdown" } });
  const check = () => {
    const found: { from: number; to: number; message: string }[] = [];
    const iter = registry.annotations(uri)!.validations.iter(0);
    while (iter.value) {
      found.push({ from: iter.from, to: iter.to, message: iter.value.type.message ?? "" });
      iter.next();
    }
    const hello = source.indexOf("Hello");
    const expected = [{ from: hello, to: hello + 5, message: "Incomplete statement: expected assignment or a function call" }];
    if (source.includes("Well, friend.")) {
      const end = source.indexOf("\nend\n") + 1;
      expected.unshift({ from: end, to: end + 3, message: "Expected identifier, got 'end'" });
    }
    expect(found).toEqual(expected);
  };
  check();
  let version = 2;
  for (const [before, after] of [["Well, friend.", "print(1)"], ["print(1)", "Well, friend."], ["-- 😀 comment", "-- 🦊 changed"], ["Well, friend.", "print(2)"]] as const) {
    const offset = source.indexOf(before);
    expect(offset).toBeGreaterThanOrEqual(0);
    const text = Text.of(source.split("\n"));
    const position = (at: number) => {
      const line = text.lineAt(at);
      return { line: line.number - 1, character: at - line.from };
    };
    registry.update({ textDocument: { uri, version: version++ }, contentChanges: [{
      range: { start: position(offset), end: position(offset + before.length) }, text: after,
    }] });
    source = source.slice(0, offset) + after + source.slice(offset + before.length);
    check();
  }
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
