import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import grammar from "../../language/sparkdown.language-grammar.json";
import { treeScopes, vscodeScopes } from "./engineScopes";

const extensionGrammar = JSON.parse(
  readFileSync(
    new URL("../../../../vscode-sparkdown/language/sparkdown.language-grammar.json", import.meta.url),
    "utf8",
  ),
);

const scopesOf = async (text: string) => ({
  vscode: await vscodeScopes(extensionGrammar, text),
  tree: treeScopes(grammar, text),
});

const BODY = ` sofa {
  x = 60%
  y = 100%
  zoom = 1.2
}
`;

describe("a framing block and the at and to clauses scope as their models do (I-2479)", () => {
  test("a framing block gives its words the scopes an animation block gives them, with framing for animation", async () => {
    const framing = await scopesOf(`framing${BODY}`);
    const animation = await scopesOf(`animation${BODY}`);
    const named = (scopes: string[]) => scopes.map((scope) => scope.replaceAll(".animation.", ".framing."));
    expect(framing.vscode[0]).toContain("keyword.control.framing.luau");
    expect(framing.vscode.slice(0, 7)).toEqual(named(animation.vscode.slice(0, 7)));
    expect(framing.vscode.slice(7)).toEqual(named(animation.vscode.slice(9)));
    expect(framing.tree).toEqual(framing.vscode);
  });

  test("at and to scope as the clause word with does, and the framing name as its value", async () => {
    const lines = ["[[show backdrop bg at right]]", "[[animate backdrop to right]]", "[[bunny at right]]"];
    for (const line of lines) {
      const clause = line.includes(" at ") ? " at " : " to ";
      const model = line.replace(clause, " with ");
      const framed = await scopesOf(`${line}\n`);
      const withed = await scopesOf(`${model}\n`);
      const at = line.indexOf(clause) + 1;
      expect(framed.vscode.slice(at, at + 2), line).toEqual(withed.vscode.slice(at, at + 2));
      expect(framed.vscode.slice(at + 2), line).toEqual(withed.vscode.slice(at + 4));
      expect(framed.tree, line).toEqual(framed.vscode);
    }
  });
});
