import { Grammar } from "@impower/textmate-grammar-tree/src/grammar/classes/Grammar";
import { describe, expect, test } from "vitest";
import { treeScopes, vscodeScopes } from "./engineScopes";

const block = (patterns: object[]) => ({ begin: "\\(", end: "\\)", name: "block", patterns });

const scopesOf = (grammar: any, text: string, others: any[] = []) => {
  let tree: string[] | string;
  try {
    tree = treeScopes(grammar, text, others);
  } catch (e: any) {
    tree = `THROWS: ${e.message}`;
  }
  return tree;
};

describe("a rule-level repository resolves as vscode-textmate resolves it (I-2066)", () => {
  test.each([
    [
      "an include of a rule only the enclosing rule's repository holds",
      {
        scopeName: "source.probe",
        repository: { Other: { name: "o", match: "b" } },
        patterns: [{ repository: { Inner: { name: "x", match: "a" } }, patterns: [block([{ include: "#Inner" }])] }],
      },
      "(a)",
    ],
    [
      "a grammar with no top-level repository",
      {
        scopeName: "source.probe",
        patterns: [{ repository: { Inner: { name: "x", match: "a" } }, patterns: [block([{ include: "#Inner" }])] }],
      },
      "(a)",
    ],
    [
      "a nested rule overrides a top-level rule of the same name",
      {
        scopeName: "source.probe",
        repository: { Inner: { name: "top", match: "a" } },
        patterns: [
          { repository: { Inner: { name: "nested", match: "a" } }, patterns: [block([{ include: "#Inner" }])] },
          { include: "#Inner" },
        ],
      },
      "(a) a",
    ],
    [
      "repositories nest, the innermost first",
      {
        scopeName: "source.probe",
        patterns: [
          {
            repository: { A: { name: "outer.a", match: "a" }, B: { name: "outer.b", match: "b" } },
            patterns: [{ repository: { A: { name: "inner.a", match: "a" } }, patterns: [block([{ include: "#A" }, { include: "#B" }])] }],
          },
        ],
      },
      "(ab)",
    ],
    [
      "a top-level rule first reached inside a nested repository resolves its includes there",
      {
        scopeName: "source.probe",
        repository: { Shared: block([{ include: "#Inner" }]) },
        patterns: [{ repository: { Inner: { name: "x", match: "a" } }, patterns: [{ include: "#Shared" }] }],
      },
      "(a)",
    ],
    [
      "a top-level rule first reached at the top level does not see a later nested repository",
      {
        scopeName: "source.probe",
        repository: { Shared: block([{ include: "#Inner" }, { name: "w", match: "a" }]) },
        patterns: [{ include: "#Shared" }, { repository: { Inner: { name: "x", match: "a" } }, patterns: [{ include: "#Shared" }] }],
      },
      "(a)",
    ],
    [
      "a begin/end rule's own repository is ignored",
      {
        scopeName: "source.probe",
        patterns: [
          {
            begin: "\\(",
            end: "\\)",
            name: "block",
            repository: { Inner: { name: "x", match: "a" } },
            patterns: [{ include: "#Inner" }, { name: "w", match: "a" }],
          },
        ],
      },
      "(a)",
    ],
    [
      "a nested repository on a top-level repository rule",
      {
        scopeName: "source.probe",
        repository: { Outer: { repository: { Inner: { name: "x", match: "a" } }, patterns: [block([{ include: "#Inner" }])] } },
        patterns: [{ include: "#Outer" }],
      },
      "(a)",
    ],
  ])("%s", async (_, grammar, text) => {
    const vscode = await vscodeScopes(structuredClone(grammar), text);
    expect(scopesOf(grammar, text)).toEqual(vscode);
  });

  test("an included grammar's nested repository resolves inside that grammar", async () => {
    const outer = { scopeName: "source.outer", patterns: [{ include: "source.inner" }] };
    const inner = {
      scopeName: "source.inner",
      repository: { Inner: { name: "top", match: "a" } },
      patterns: [{ repository: { Inner: { name: "nested", match: "a" } }, patterns: [block([{ include: "#Inner" }])] }],
    };
    const text = "(a)";
    const vscode = await vscodeScopes(structuredClone(outer), text, [structuredClone(inner)]);
    expect(vscode[1]).toBe("source.outer block nested");
    expect(scopesOf(outer, text, [inner])).toEqual(vscode);
  });

  test.each([
    [
      "a qualified include into the same grammar resolves in that grammar's top-level repository",
      {
        scopeName: "source.probe",
        repository: { Shared: block([{ include: "#Inner" }, { name: "fallback", match: "a" }]) },
        patterns: [{ repository: { Inner: { name: "nested", match: "a" } }, patterns: [{ include: "source.probe#Shared" }] }],
      },
      "(a)",
    ],
    [
      "a nested rule and a top-level rule named like its generated id stay distinct",
      {
        scopeName: "source.probe",
        repository: {
          Owner: { repository: { Inner: { name: "nested", match: "a" } }, patterns: [block([{ include: "#Inner" }])] },
          "Owner#Inner": { name: "unrelated", match: "a" },
        },
        patterns: [{ include: "#Owner" }, { include: "#Owner#Inner" }],
      },
      "(a) a",
    ],
  ])("%s", async (_, grammar, text) => {
    const vscode = await vscodeScopes(structuredClone(grammar), text);
    expect(scopesOf(grammar, text)).toEqual(vscode);
  });

  test.each(["_begin", "_end", "_content", "_content-p0", "_begin_c1"])(
    "a top-level rule named like a nested rule's generated %s id stays distinct",
    async (suffix) => {
      const grammar = {
        scopeName: "source.probe",
        repository: {
          Owner: {
            repository: {
              Inner: {
                begin: "([(])",
                end: "[)]",
                name: "block",
                beginCaptures: { 1: { name: "open" } },
                patterns: [{ name: "nested", match: "a" }],
              },
            },
            patterns: [{ include: "#Inner" }],
          },
          [`Owner#Inner${suffix}`]: { name: "unrelated", match: "z" },
        },
        patterns: [{ include: "#Owner" }, { include: `#Owner#Inner${suffix}` }],
      };
      const text = "(a) z";
      const vscode = await vscodeScopes(structuredClone(grammar), text);
      expect(vscode[1]).toBe("source.probe block nested");
      expect(scopesOf(grammar, text)).toEqual(vscode);
    },
  );

  test.each([
    ["Inner-p0", { patterns: [{ name: "unrelated", match: "z" }] }, "a z"],
    ["Inner_content-p0", { begin: "<", end: ">", name: "outer", patterns: [{ name: "unrelated", match: "z" }] }, "a <z>"],
    ["Inner_c1", { match: "(z)", captures: { 1: { patterns: [{ name: "unrelated", match: "z" }] } } }, "a z"],
  ])(
    "a nested rule named like an id a top-level rule generates later (%s) stays distinct",
    async (key, top, text) => {
      const grammar = {
        scopeName: "source.probe",
        repository: {
          Owner: { repository: { [key]: { name: "nested", match: "a" } }, patterns: [{ include: `#${key}` }] },
          "Owner#Inner": top,
        },
        patterns: [{ include: "#Owner" }, { include: "#Owner#Inner" }],
      };
      const vscode = await vscodeScopes(structuredClone(grammar), text);
      expect(vscode[0]).toBe("source.probe nested");
      expect(scopesOf(grammar, text)).toEqual(vscode);
    },
  );

  test("a rule included from another grammar binds before that grammar's root patterns", async () => {
    const outer = { scopeName: "source.outer", patterns: [{ include: "source.inner#Shared" }] };
    const inner = {
      scopeName: "source.inner",
      repository: { Shared: block([{ include: "#Inner" }, { name: "fallback", match: "a" }]) },
      patterns: [{ repository: { Inner: { name: "nested", match: "a" } }, patterns: [{ include: "#Shared" }] }],
    };
    const text = "(a)";
    const vscode = await vscodeScopes(structuredClone(outer), text, [structuredClone(inner)]);
    expect(vscode[1]).toBe("source.outer block fallback");
    expect(scopesOf(outer, text, [inner])).toEqual(vscode);
  });

  test("a grammar's $self first reached inside a nested repository resolves its includes there", async () => {
    const outer = { scopeName: "source.outer", patterns: [{ include: "source.inner#Wrap" }] };
    const inner = {
      scopeName: "source.inner",
      repository: {
        Wrap: { repository: { X: { name: "nested", match: "a" }, Y: { name: "nested", match: "b" } }, patterns: [block([{ include: "$self" }])] },
        Y: { name: "top", match: "b" },
      },
      patterns: [{ include: "#X" }, { include: "#Y" }],
    };
    const text = "(ab)";
    const vscode = await vscodeScopes(structuredClone(outer), text, [structuredClone(inner)]);
    expect(scopesOf(outer, text, [inner])).toEqual(vscode);
  });

  test("a grammar's root patterns that an include never reaches are not built", async () => {
    const outer = { scopeName: "source.outer", patterns: [{ include: "source.inner#Good" }] };
    const inner = {
      scopeName: "source.inner",
      repository: { Good: { name: "good", match: "a" } },
      patterns: [{ patterns: [{ begin: "x", while: "y", patterns: [] }] }],
    };
    const text = "a";
    const vscode = await vscodeScopes(structuredClone(outer), text, [structuredClone(inner)]);
    expect(vscode[0]).toBe("source.outer good");
    expect(scopesOf(outer, text, [inner])).toEqual(vscode);
  });

  test("a nested rule that names only a scope reads as the same rule does at the top level", () => {
    const text = "(a)";
    const nested = {
      scopeName: "source.probe",
      patterns: [{ repository: { Inner: { name: "x" } }, patterns: [block([{ include: "#Inner" }])] }],
    };
    const top = {
      scopeName: "source.probe",
      repository: { Inner: { name: "x" } },
      patterns: [block([{ include: "#Inner" }])],
    };
    expect(scopesOf(nested, text)).toEqual(scopesOf(top, text));
  });

  test("nested rules take node names distinct from top-level rules of the same name", () => {
    const grammar = new Grammar({
      scopeName: "source.probe",
      repository: { Inner: { name: "top", match: "a" } },
      patterns: [
        { repository: { Inner: { name: "nested", match: "a" } }, patterns: [block([{ include: "#Inner" }])] },
        { repository: { Inner: { name: "again", match: "a" } }, patterns: [block([{ include: "#Inner" }])] },
        { include: "#Inner" },
      ],
    } as any);
    expect(new Set(grammar.nodeNames).size).toBe(grammar.nodeNames.length);
    const named = (scope: string) => grammar.nodes.filter((node) => node.props?.["name"] === scope);
    expect(grammar.nodeNames).toContain("Inner");
    expect(named("nested")).toHaveLength(1);
    expect(named("again")).toHaveLength(1);
  });
});

describe("every rule a grammar with nested repositories builds keeps its own id (I-2066)", () => {
  const TOP_KEYS = ["O", "P", "I", "O#I", "O#I#1", "O#1", "O#1#I", "O#2#I", "P#I", "O#I#I"];
  const NESTED_KEYS = [
    "I",
    "1",
    "I-p0",
    "I-p1",
    "I_c1",
    "I_begin",
    "I_end",
    "I_content",
    "I_content-p0",
    "I_begin_c1",
    "1#I",
    "I#1",
    "-p0",
    "_c1",
    "#I",
  ];

  const random = (seed: number) => () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  const generate = (seed: number) => {
    const next = random(seed);
    const pick = <T>(items: readonly T[]) => items[Math.floor(next() * items.length)]!;
    const names: string[] = [];
    const named = () => {
      const name = `n${names.length}`;
      names.push(name);
      return name;
    };
    const rule = (depth: number): object => {
      const kind = pick(depth < 2 ? ["match", "scoped", "owner", "owner"] : ["match", "scoped"]);
      if (kind === "match") {
        return {
          name: named(),
          match: "(x)",
          captures: { 1: { name: named(), patterns: [{ name: named(), match: "y" }] } },
        };
      }
      if (kind === "scoped") {
        return {
          name: named(),
          begin: "(<)",
          end: ">",
          beginCaptures: { 1: { name: named() } },
          patterns: [{ name: named(), match: "z" }],
        };
      }
      const repository: Record<string, object> = {};
      const count = 1 + Math.floor(next() * 4);
      for (let i = 0; i < count; i++) {
        const key = pick(NESTED_KEYS);
        if (!(key in repository)) {
          repository[key] = rule(depth + 1);
        }
      }
      return {
        name: named(),
        repository,
        patterns: [{ name: named(), match: "w" }, ...Object.keys(repository).map((key) => ({ include: `#${key}` }))],
      };
    };
    const repository: Record<string, object> = {};
    const count = 1 + Math.floor(next() * 5);
    for (let i = 0; i < count; i++) {
      const key = pick(TOP_KEYS);
      if (!(key in repository)) {
        repository[key] = rule(0);
      }
    }
    const keys = Object.keys(repository);
    const patterns = keys.map((key) => ({ include: `#${key}` }));
    return {
      grammar: { scopeName: "source.probe", repository, patterns: next() < 0.5 ? patterns : patterns.reverse() },
      names,
    };
  };

  test.each(Array.from({ length: 400 }, (_, seed) => seed))("generated grammar %i", (seed) => {
    const { grammar, names } = generate(seed);
    const built = new Grammar(grammar as any).nodes.map((node) => node.props?.["name"]).filter(Boolean);
    const counts = new Map<string, number>();
    for (const name of built) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    expect(names.filter((name) => counts.get(name) !== 1)).toEqual([]);
  });
});
