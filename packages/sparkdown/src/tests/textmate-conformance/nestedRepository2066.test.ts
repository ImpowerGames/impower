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
