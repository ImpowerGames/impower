import { describe, expect, test } from "vitest";
import { treeScopes, vscodeScopes } from "./engineScopes";

const block = (patterns: object[]) => ({ begin: "\\(", end: "\\)", name: "block", patterns });

describe("a repository rule with no match, begin, patterns or include matches nothing, as in vscode-textmate (I-2087)", () => {
  test.each([
    [
      "a top-level name-only rule",
      { scopeName: "source.probe", repository: { X: { name: "x" } }, patterns: [{ include: "#X" }] },
      "ab",
    ],
    [
      "a nested name-only rule",
      {
        scopeName: "source.probe",
        patterns: [{ repository: { X: { name: "x" } }, patterns: [block([{ include: "#X" }, { name: "w", match: "[ab]" }])] }],
      },
      "(ab)",
    ],
    [
      "a top-level name-only rule inside a capture's patterns",
      {
        scopeName: "source.probe",
        repository: { X: { name: "x" } },
        patterns: [{ match: "(a)b", captures: { 1: { patterns: [{ include: "#X" }] } } }],
      },
      "ab",
    ],
    [
      "a nested name-only rule inside a capture's patterns",
      {
        scopeName: "source.probe",
        patterns: [
          {
            repository: { X: { name: "x" } },
            patterns: [{ match: "(a)b", captures: { 1: { patterns: [{ include: "#X" }] } } }],
          },
        ],
      },
      "ab",
    ],
    [
      "a captures-only rule inside a capture's patterns",
      {
        scopeName: "source.probe",
        repository: { X: { captures: { 0: { name: "x" } } } },
        patterns: [{ match: "(a)b", captures: { 1: { patterns: [{ include: "#X" }] } } }],
      },
      "ab",
    ],
    [
      "a name-only rule before a rule that matches",
      {
        scopeName: "source.probe",
        repository: { X: { name: "x" }, Y: { name: "y", match: "a" } },
        patterns: [{ include: "#X" }, { include: "#Y" }],
      },
      "ab",
    ],
    [
      "a rule with an explicit match keeps it",
      { scopeName: "source.probe", repository: { X: { name: "x", match: "(.+)" } }, patterns: [{ include: "#X" }] },
      "ab",
    ],
  ])("%s", async (_, grammar, text) => {
    const vscode = await vscodeScopes(structuredClone(grammar), text);
    expect(treeScopes(grammar, text)).toEqual(vscode);
  });

  test("vscode-textmate leaves a name-only rule's text with only the grammar's scope", async () => {
    const grammar = { scopeName: "source.probe", repository: { X: { name: "x" } }, patterns: [{ include: "#X" }] };
    expect(await vscodeScopes(grammar, "ab")).toEqual(["source.probe", "source.probe"]);
  });
});
