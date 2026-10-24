// A `..` right after a mid-line `>` break is a glue mark in both TextMate
// engines (I-557): vscode-textmate, which the extension uses, and
// textmate-grammar-tree, which the web editor uses, give it the same
// `keyword.other.glue.sd` scope as the `..` that ends `A > ..`. A third dot
// makes an ellipsis, and dots inside a word are text.
import { describe, expect, test } from "vitest";
import grammar from "../../../language/sparkdown.language-grammar.json";
import { treeScopes, vscodeScopes } from "./engineScopes";

const GLUE = "keyword.other.glue.sd";

/** The scopes of the first `..` at or after `from` in `text`, per engine. */
const scopesAt = async (text: string, from: number) => {
  const vscode = await vscodeScopes(grammar, text);
  const tree = treeScopes(grammar, text);
  return { vscode: vscode.slice(from, from + 2), tree: tree.slice(from, from + 2) };
};

describe("a `..` after a mid-line break is a glue mark (I-557)", () => {
  test.each([
    ["A > .. B", 4],
    ["Hold on > ..tight.", 10],
    ["Abso >..lutely.", 6],
    ["A .. > .. B", 7],
    ["A > ..", 4],
  ])("%s", async (line, from) => {
    const { vscode, tree } = await scopesAt(`${line}\n`, from);
    for (const scope of vscode) expect(scope.split(" ")).toContain(GLUE);
    expect(tree).toEqual(vscode);
  });

  test.each([
    ["One > ...", 6],
    ["a..b", 1],
  ])("%s stays text", async (line, from) => {
    const { vscode, tree } = await scopesAt(`${line}\n`, from);
    for (const scope of vscode) expect(scope.split(" ")).not.toContain(GLUE);
    expect(tree).toEqual(vscode);
  });
});
