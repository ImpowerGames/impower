import { describe, expect, test } from "vitest";
import { parseSource } from "./grammarSnapshot";
import { treeScopeStackAt, vscodeScopeStacksPerChar } from "./scopeEquality";

const SOURCE = `morph talk {
  timing {
    duration = 0.35
  }

  replay {
    start = 0%
    end = 66.667%
    chance = 50%
  }
}

scene start
end
`;

const at = (text: string) => SOURCE.indexOf(text);

const PAIRS: [string, string][] = [
  ["    start", "    end ="],
  ["start = ", "end = "],
  ["0%", "66.667%"],
  ["chance", "end ="],
];

describe("a replay block's `end` key reads as a key, not as the declaration's `end` (#2580)", () => {
  test("tree engine", () => {
    const tree = parseSource(SOURCE);
    for (const [a, b] of PAIRS) {
      expect(treeScopeStackAt(tree, at(b)), `${a} / ${b}`).toEqual(treeScopeStackAt(tree, at(a)));
    }
    expect(treeScopeStackAt(tree, at("}\n\nscene"))).toContain("meta.morph.luau");
    expect(treeScopeStackAt(tree, at("scene start"))).not.toContain("meta.morph.luau");
  });

  test("vscode-textmate", async () => {
    const stacks = await vscodeScopeStacksPerChar(SOURCE);
    for (const [a, b] of PAIRS) {
      expect(stacks[at(b)], `${a} / ${b}`).toEqual(stacks[at(a)]);
    }
    expect(stacks[at("}\n\nscene")]).toContain("meta.morph.luau");
    expect(stacks[at("scene start")]).not.toContain("meta.morph.luau");
  });
});
