import { describe, expect, test } from "vitest";
import { treeScopes, vscodeScopes } from "./engineScopes";

describe("a top-level rule named like a generated id stays distinct (I-2086)", () => {
  test.each([
    [
      "an inline pattern id",
      {
        scopeName: "source.probe",
        repository: { Foo: { patterns: [{ name: "inline", match: "a" }] }, "Foo-p0": { name: "top", match: "z" } },
        patterns: [{ include: "#Foo" }, { include: "#Foo-p0" }],
      },
      "a z",
    ],
    [
      "a capture id",
      {
        scopeName: "source.probe",
        repository: {
          Foo: { match: "(a)", captures: { 1: { name: "cap" } } },
          Foo_c1: { name: "top", match: "z" },
        },
        patterns: [{ include: "#Foo" }, { include: "#Foo_c1" }],
      },
      "a z",
    ],
    [
      "a renamed id's own generated id",
      {
        scopeName: "source.probe",
        repository: {
          Foo: { patterns: [{ name: "inline", begin: "<", end: ">", patterns: [{ name: "deep", match: "q" }] }] },
          "Foo-p0": { name: "top", match: "z" },
          "Foo-p0-1": { name: "other", match: "y" },
          "Foo-p0-1_content-p0": { name: "far", match: "x" },
        },
        patterns: [{ include: "#Foo" }, { include: "#Foo-p0" }, { include: "#Foo-p0-1" }, { include: "#Foo-p0-1_content-p0" }],
      },
      "<q> z y x",
    ],
  ])("%s", async (_, grammar, text) => {
    const vscode = await vscodeScopes(structuredClone(grammar), text);
    expect(treeScopes(grammar, text)).toEqual(vscode);
  });

  test.each(["_begin", "_end", "_content"])(
    "a top-level rule named like a begin/end rule's %s id reads as it does under another name",
    async (suffix) => {
      const grammarWith = (key: string) => ({
        scopeName: "source.probe",
        repository: {
          Foo: { name: "outer", begin: "<", end: ">", contentName: "ci", patterns: [{ name: "inner", match: "q" }] },
          [key]: { name: "top", match: "z" },
        },
        patterns: [{ include: "#Foo" }, { include: `#${key}` }],
      });
      const text = "<q> z";
      const vscode = await vscodeScopes(structuredClone(grammarWith(`Foo${suffix}`)), text);
      expect(vscode[4]).toBe("source.probe top");
      expect(treeScopes(grammarWith(`Foo${suffix}`), text)).toEqual(treeScopes(grammarWith("Bar"), text));
    },
  );
});
