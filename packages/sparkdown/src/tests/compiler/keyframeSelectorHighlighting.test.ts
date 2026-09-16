import { describe, expect, test } from "vitest";
import { parseSource } from "./grammarSnapshot";

/** Every node name the grammar gives to the exact text `key` in `source`. */
function nodeNamesFor(source: string, key: string): string[] {
  const tree = parseSource(source);
  const names: string[] = [];
  const cur = tree.cursor();
  do {
    if (source.slice(cur.from, cur.to) === key) {
      names.push(cur.name);
    }
  } while (cur.next());
  return names;
}

describe("keyframe position keys are highlighted as positions", () => {
  const ANIMATION = `animation fade with
  keyframes:
    from:
      opacity = "0"
    40%:
      opacity = "0.5"
    to:
      opacity = "1"
  timing:
    duration = 0.4
end
`;

  test("`from`, a percentage and `to` are keyframe selectors", () => {
    expect(nodeNamesFor(ANIMATION, "from")).toContain("LuauKeyframeSelector");
    expect(nodeNamesFor(ANIMATION, "40%")).toContain("LuauKeyframeSelector");
    expect(nodeNamesFor(ANIMATION, "to")).toContain("LuauKeyframeSelector");
  });

  test("an ordinary container key is not a keyframe selector", () => {
    expect(nodeNamesFor(ANIMATION, "timing")).not.toContain(
      "LuauKeyframeSelector",
    );
  });

  test("a key that merely starts with a position word is not a selector", () => {
    const source = `screen menu with
  from_left:
    text "hi"
end
`;
    expect(nodeNamesFor(source, "from_left")).not.toContain(
      "LuauKeyframeSelector",
    );
    expect(nodeNamesFor(source, "from")).not.toContain("LuauKeyframeSelector");
  });
});
