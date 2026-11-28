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

describe("`using` is coloured as a clause word in both generated grammars (I-2883)", () => {
  test.each([
    "[[show portrait hero using fade over 2s]]",
    "[[hide portrait with spin using fade]]",
    "[[hero using screenfade]]",
  ])("`%s` scopes `using` and its name as `with` and its name", async (line) => {
    const model = line.replace(" using ", " with ");
    const used = await scopesOf(`${line}\n`);
    const withed = await scopesOf(`${model}\n`);
    const at = line.indexOf(" using ") + 1;
    const clauseScope = withed.vscode[at]!;
    expect(clauseScope).toMatch(/keyword/);
    expect(used.vscode.slice(at, at + "using".length)).toEqual(Array("using".length).fill(clauseScope));
    expect(used.vscode.slice(at + "using".length)).toEqual(withed.vscode.slice(at + "with".length));
    expect(used.tree).toEqual(used.vscode);
  });
});
