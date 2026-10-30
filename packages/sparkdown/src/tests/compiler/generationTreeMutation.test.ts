import { describe, expect, it } from "vitest";
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

const EDIT_LINE = SOURCE.split("\n").indexOf(
  "  Action line in scene two.",
);

describe("preparation does not mutate the parsed hierarchy", () => {
  it("ObjectExpression.PrepareIntoContainer is idempotent on `content`", () => {
    const expr = new ObjectExpression([
      new ObjectExpressionEntry("alpha", new NumberExpression(1, "int")),
      new ObjectExpressionEntry("beta", new NumberExpression(2, "int")),
      new ObjectExpressionEntry("gamma", new NumberExpression(3, "int")),
    ]);
    const initial = expr.content.length;

    for (let i = 0; i < 5; i++) {
      expr.PrepareIntoContainer();
      expect(expr.content.length).toBe(initial);
    }
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

    for (let i = 0; i < 3; i++) editAndCompile();
    const baseline = objectExpressionContentTotal(compiler);
    expect(baseline.nodes).toBeGreaterThan(0);
    expect(baseline.content).toBeGreaterThan(0);

    for (let i = 0; i < 8; i++) editAndCompile();
    const after = objectExpressionContentTotal(compiler);

    expect(after.nodes).toBe(baseline.nodes);
    expect(after.content).toBe(baseline.content);
  });
});
