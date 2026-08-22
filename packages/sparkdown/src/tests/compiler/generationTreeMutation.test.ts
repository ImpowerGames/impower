// Generation must not mutate the parsed hierarchy.
//
// The incremental pipeline carries parsed chunks forward across compiles by
// identity — that is the whole point of the design. So any node that MUTATES
// itself while generating runtime objects accumulates one lowered generation
// per compile and never releases the previous one.
//
// `ObjectExpression.GenerateIntoContainer` did exactly that: it built a fresh
// `StringExpression`/`Text` per static key and `AddContent`-ed it to itself on
// every generation pass. Each accumulated `Text` then pinned a whole runtime
// container subtree through its cached `_runtimeObject`'s parent chain, so a
// real editing session retained ~5.5MB per keystroke and eventually exhausted
// the language-server worker heap (issue #312).
//
// These tests pin the invariant structurally rather than by measuring heap
// bytes, so they are deterministic and cheap: generation is idempotent with
// respect to the parsed tree, and repeated incremental compiles do not grow it.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { Container as RuntimeContainer } from "../../inkjs/engine/Container";
import {
  ObjectExpression,
  ObjectExpressionEntry,
} from "../../inkjs/compiler/Parser/ParsedHierarchy/Expression/ObjectExpression";
import { NumberExpression } from "../../inkjs/compiler/Parser/ParsedHierarchy/Expression/NumberExpression";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const URI = "inmemory:///main.sd";

const quiet = <T,>(fn: () => T): T => {
  const w = console.warn;
  const e = console.error;
  console.warn = () => {};
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.warn = w;
    console.error = e;
  }
};

/**
 * Sum of `content.length` over every `ObjectExpression` reachable from the
 * compiler. Stays constant across compiles unless generation is appending to
 * carried-forward parsed nodes.
 */
function objectExpressionContentTotal(root: object): {
  nodes: number;
  content: number;
} {
  const seen = new Set<unknown>([root]);
  const queue: any[] = [root];
  let nodes = 0;
  let content = 0;
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    if (cur instanceof ObjectExpression) {
      nodes += 1;
      content += cur.content.length;
    }
    let children: unknown[];
    if (Array.isArray(cur)) {
      children = cur;
    } else if (cur instanceof Set) {
      children = [...cur];
    } else if (cur instanceof Map) {
      children = [...cur.keys(), ...cur.values()];
    } else {
      children = [];
      for (const key of Object.getOwnPropertyNames(cur)) {
        // Skip accessors — invoking a getter here could compute or throw.
        const d = Object.getOwnPropertyDescriptor(cur, key);
        if (d && !d.get) children.push(d.value);
      }
    }
    for (const child of children) {
      if (!child) continue;
      const t = typeof child;
      if (t !== "object" && t !== "function") continue;
      if (seen.has(child)) continue;
      seen.add(child);
      queue.push(child);
    }
  }
  return { nodes, content };
}

// A `define` block lowers to a `__def(...)` call whose argument is an
// ObjectExpression with static keys — the exact shape that accumulated. The
// edit target sits in a separate scene so the define chunk is carried forward
// untouched, which is what makes its ObjectExpression a carried-forward node.
const SOURCE = [
  "define Portrait with",
  "  image = 1",
  "  offset = 2",
  "  scale = 3",
  "end",
  "",
  "define Backdrop with",
  "  image = 4",
  "  tint = 5",
  "end",
  "",
  "scene one",
  ":",
  "  Action line in scene one.",
  "-> DONE",
  "end",
  "",
  "scene two",
  ":",
  "  Action line in scene two.",
  "-> DONE",
  "end",
  "",
].join("\n");

// 0-based line of "  Action line in scene two." — the edit site.
const EDIT_LINE = SOURCE.split("\n").indexOf(
  "  Action line in scene two.",
);

describe("generation does not mutate the parsed hierarchy", () => {
  it("ObjectExpression.GenerateIntoContainer is idempotent on `content`", () => {
    const expr = new ObjectExpression([
      new ObjectExpressionEntry("alpha", new NumberExpression(1, "int")),
      new ObjectExpressionEntry("beta", new NumberExpression(2, "int")),
      new ObjectExpressionEntry("gamma", new NumberExpression(3, "int")),
    ]);
    const initial = expr.content.length;

    const emitted: number[] = [];
    for (let i = 0; i < 5; i++) {
      const container = new RuntimeContainer();
      expr.GenerateIntoContainer(container);
      emitted.push(container.content.length);
      // The parsed node must look exactly as it did before generating.
      expect(expr.content.length).toBe(initial);
    }

    // ...and every pass must still emit the same runtime shape, so the
    // idempotency did not come at the cost of dropping the key expressions.
    expect(new Set(emitted).size).toBe(1);
    expect(emitted[0]).toBeGreaterThan(0);
  });

  it("repeated incremental compiles do not grow the parsed tree", () => {
    const compiler = new SparkdownCompiler();
    quiet(() => {
      compiler.configure({
        files: [
          {
            uri: URI,
            type: "script",
            name: "main",
            ext: "sd",
            text: SOURCE,
            version: 1,
            languageId: "sparkdown",
          },
        ],
      } as never);
      compiler.compile({ textDocument: { uri: URI } } as never);
    });

    let character = "  Action line in scene two.".length;
    let version = 1;
    const editAndCompile = () => {
      version += 1;
      quiet(() => {
        compiler.updateDocument({
          textDocument: { uri: URI, version },
          contentChanges: [
            {
              range: {
                start: { line: EDIT_LINE, character },
                end: { line: EDIT_LINE, character },
              },
              text: "x",
            },
          ],
        } as never);
        character += 1;
        compiler.compile({ textDocument: { uri: URI } } as never);
      });
    };

    // Warm up so every one-time cache is populated before the baseline.
    for (let i = 0; i < 3; i++) editAndCompile();
    const baseline = objectExpressionContentTotal(compiler);
    expect(baseline.nodes).toBeGreaterThan(0);
    expect(baseline.content).toBeGreaterThan(0);

    for (let i = 0; i < 8; i++) editAndCompile();
    const after = objectExpressionContentTotal(compiler);

    // Same nodes, same content: no generation was appended to the tree.
    // Before the fix this grew by one key expression per static key per
    // compile, without bound.
    expect(after.nodes).toBe(baseline.nodes);
    expect(after.content).toBe(baseline.content);
  });
});
