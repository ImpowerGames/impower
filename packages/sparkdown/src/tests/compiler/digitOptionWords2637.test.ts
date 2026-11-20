import { describe, expect, it } from "vitest";
import { dumpTree, stripAnsi } from "./grammarSnapshot";
import { tokenize } from "./vscodeGrammarSnapshot";

const OPTION_SCOPE = "variable.other.constant.asset.filter.sd";
const CASES: [string, string][] = [
  ["[[mia:look.2]]", "look.2"],
  ["[[mia:20]]", "20"],
  ["[[mia:2look.3d]]", "2look.3d"],
  ["[[mia:_a.b]]", "_a.b"],
];

describe("an option word may start with a digit", () => {
  it.each(CASES)("lezer reads %s with %s as one option name", (source, option) => {
    const tree = stripAnsi(dumpTree(source));
    expect(tree).not.toContain("ERROR_UNRECOGNIZED");
    expect(tree).toContain(`AssetCommandFilterName [6..${6 + option.length}]: "${option}"`);
  });

  it.each(CASES)("TextMate scopes %s with %s as one option", async (source, option) => {
    const [line] = await tokenize(source);
    const scoped = line!.tokens.filter((token) => token.scopes.includes(OPTION_SCOPE)).map((token) => token.text);
    expect(scoped).toEqual([option]);
  });
});
