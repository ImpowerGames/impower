import { describe, expect, test } from "vitest";
import { parseSource } from "./grammarSnapshot";
import { treeScopeStackAt, vscodeScopeStacksPerChar } from "./scopeEquality";

const SOURCE = `morph talk {
  timing {
    duration = 0.35
  }

  replay {
    from = 0%
    to = 66.667%
    chance = 50%
  }

  keyframes {
    from { mouth { state = open } }
    to { mouth { state = closed } }
  }
}

scene start
end
`;

const at = (text: string) => SOURCE.indexOf(text);

const PAIRS: [string, string][] = [
  ["chance =", "from ="],
  ["chance =", "to ="],
  ["= 50%", "= 0%"],
  ["= 50%", "= 66.667%"],
  ["50%", "66.667%"],
];

const SELECTORS: [string, string][] = [
  ["from =", "from {"],
  ["to =", "to {"],
];

describe("a replay block's `from` and `to` read as fields, as `chance` does, and keyframes' `from` and `to` stay selectors (#2625)", () => {
  test("tree engine", () => {
    const tree = parseSource(SOURCE);
    for (const [a, b] of PAIRS) {
      expect(treeScopeStackAt(tree, at(b)), `${a} / ${b}`).toEqual(treeScopeStackAt(tree, at(a)));
    }
    for (const [field, selector] of SELECTORS) {
      expect(treeScopeStackAt(tree, at(selector)), `${field} / ${selector}`).not.toEqual(treeScopeStackAt(tree, at(field)));
    }
    expect(treeScopeStackAt(tree, at("}\n\nscene"))).toContain("meta.morph.luau");
    expect(treeScopeStackAt(tree, at("scene start"))).not.toContain("meta.morph.luau");
  });

  test("vscode-textmate", async () => {
    const stacks = await vscodeScopeStacksPerChar(SOURCE);
    for (const [a, b] of PAIRS) {
      expect(stacks[at(b)], `${a} / ${b}`).toEqual(stacks[at(a)]);
    }
    for (const [field, selector] of SELECTORS) {
      expect(stacks[at(selector)], `${field} / ${selector}`).not.toEqual(stacks[at(field)]);
    }
    expect(stacks[at("}\n\nscene")]).toContain("meta.morph.luau");
    expect(stacks[at("scene start")]).not.toContain("meta.morph.luau");
  });
});
