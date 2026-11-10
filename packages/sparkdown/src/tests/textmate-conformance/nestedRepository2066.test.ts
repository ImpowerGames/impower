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
