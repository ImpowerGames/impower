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

const scopesOf = async (text: string, from: number, to: number) => ({
  vscode: (await vscodeScopes(extensionGrammar, text)).slice(from, to),
  tree: treeScopes(grammar, text).slice(from, to),
});

describe("`clear` scopes like `open` in a layout directive (I-1991)", () => {
  test("[[clear textstream]] gives the verb and the layout the scopes [[open textstream]] gives them", async () => {
    const open = await scopesOf("[[open textstream]]\n", 2, 18);
    const clear = await scopesOf("[[clear textstream]]\n", 2, 19);
    expect(clear.vscode.slice(0, 5)).toEqual(Array(5).fill(open.vscode[0]));
    expect(clear.vscode.slice(5)).toEqual(open.vscode.slice(4));
    expect(clear.tree.slice(0, 5)).toEqual(Array(5).fill(open.tree[0]));
    expect(clear.tree.slice(5)).toEqual(open.tree.slice(4));
    expect(clear.tree).toEqual(clear.vscode);
  });
});
