// A `..` right after a mid-line `>` break is a glue mark in both TextMate
// engines (I-557): vscode-textmate, reading the grammar the extension ships,
// and textmate-grammar-tree, reading the grammar the web editor ships, give
// it the same `keyword.other.glue.sd` scope as the `..` that ends `A > ..`. A
// third dot makes an ellipsis, and dots inside a word are text.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import grammar from "../../../language/sparkdown.language-grammar.json";
import { treeScopes, vscodeScopes } from "./engineScopes";

const extensionGrammar = JSON.parse(
  readFileSync(
    new URL("../../../../../vscode-sparkdown/language/sparkdown.language-grammar.json", import.meta.url),
    "utf8",
  ),
);

const GLUE = "keyword.other.glue.sd";

/** The scopes of the `..` at `from` in `text`, per editor. */
const scopesAt = async (text: string, from: number) => {
  const vscode = await vscodeScopes(extensionGrammar, text);
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
