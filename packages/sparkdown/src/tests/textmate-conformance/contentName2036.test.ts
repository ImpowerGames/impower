import { describe, expect, test } from "vitest";
import { treeScopes, vscodeScopes } from "./engineScopes";

const ROOT = [{ include: "#Block" }, { include: "#Word" }, { include: "#Gap" }];

const grammarOf = (repository: Record<string, unknown>, patterns: unknown[] = ROOT) => ({
  name: "mini",
  scopeName: "source.mini",
  patterns,
  repository: {
    Word: { name: "word.mini", match: "[A-Za-z]+" },
    Gap: { match: "\\s" },
    ...repository,
  },
});

const BLOCK = {
  name: "block.mini",
  contentName: "content.mini",
  begin: "<",
  end: ">",
  patterns: [{ include: "#Word" }, { include: "#Gap" }],
};

const GRAMMARS = {
  named: grammarOf({ Block: BLOCK }),
  contentOnly: grammarOf({ Block: { ...BLOCK, name: undefined } }),
  multipleScopes: grammarOf({ Block: { ...BLOCK, contentName: "content.mini extra.mini" } }),
  nested: grammarOf({
    Block: { ...BLOCK, patterns: [{ include: "#Inner" }, { include: "#Word" }, { include: "#Gap" }] },
    Inner: {
      name: "inner.mini",
      contentName: "inner-content.mini",
      begin: "\\[",
      end: "\\]",
      patterns: [{ include: "#Word" }, { include: "#Gap" }],
    },
  }),
  capturedBeginEnd: grammarOf({ Block: BLOCK }, [
    { match: "^-(.+)", captures: { "1": { name: "captured.mini", patterns: ROOT } } },
    ...ROOT,
  ]),
  beginEndCaptures: grammarOf({
    Block: {
      ...BLOCK,
      begin: "(<)",
      end: "(>)",
      beginCaptures: { "1": { name: "open.mini" } },
      endCaptures: { "1": { name: "close.mini" } },
    },
  }),
};

describe("a begin/end rule's contentName scopes the text between begin and end (#2036)", () => {
  test("the content carries contentName and the begin and end matches do not", async () => {
    const text = "x <ab> y\n";
    const vscode = await vscodeScopes(structuredClone(GRAMMARS.named), text);
    expect(vscode[text.indexOf("ab")]).toBe("source.mini block.mini content.mini word.mini");
    expect(vscode[text.indexOf("<")]).toBe("source.mini block.mini");
    expect(treeScopes(GRAMMARS.named, text)).toEqual(vscode);
  });

  const CASES: [keyof typeof GRAMMARS, string][] = [
    ["named", "<a b>\n"],
    ["named", "<>\n"],
    ["named", "<a\nb c\nd>\n"],
    ["named", "<\nab>\n"],
    ["named", "<ab\n"],
    ["named", "<a> <b>\n"],
    ["contentOnly", "x <ab> y\n"],
    ["multipleScopes", "x <ab> y\n"],
    ["nested", "<a [b c] d>\n"],
    ["nested", "<[b]>\n"],
    ["nested", "<a [b\nc] d>\n"],
    ["capturedBeginEnd", "-x <ab> y\n"],
    ["beginEndCaptures", "x <ab> y\n"],
  ];

  test.each(CASES)("%s grammar on %j matches vscode-textmate", async (grammar, text) => {
    expect(treeScopes(GRAMMARS[grammar], text)).toEqual(await vscodeScopes(structuredClone(GRAMMARS[grammar]), text));
  });
});
