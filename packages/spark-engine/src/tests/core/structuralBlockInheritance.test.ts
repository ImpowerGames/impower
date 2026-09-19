// A structural block (`animation`, `theme`, `morph`) written `as PARENT`
// inherits at runtime from the member of its own type table named PARENT,
// builtin or authored, and is registered under its keyword type: the engine
// reads its own fields, then the parent's, then the type's `$default`.

import { describe, expect, test } from "vitest";
import { buildDefinesContext } from "../../game/core/utils/buildContextFromStory";
import { compileUI, createHarness } from "../ui/harness/uiTestHarness";

const SCENE = `
-> start
scene start
  Hello.
end
`;

const storyOf = async (source: string) => {
  const harness = createHarness(`${source}${SCENE}`);
  await harness.ready;
  return (harness.game as any).story ?? (harness.game as any)._story;
};

const contextOf = async (source: string) =>
  buildDefinesContext(await storyOf(source)) as any;

// The `__define` names along a runtime table's `__index` chain, stopping at
// the first table seen twice.
const chainOf = (story: any, global: string): string[] => {
  const names: string[] = [];
  const seen = new Set<unknown>();
  let table = story.state.variablesState.GetVariableWithName(global);
  while (table?.metatable && !seen.has(table)) {
    seen.add(table);
    const meta = table.metatable.value as Map<string, any>;
    names.push(String(meta.get("__define")?.value ?? "?"));
    table = meta.get("__index");
  }
  if (table && seen.has(table)) names.push("<cycle>");
  return names;
};

describe("structural blocks inherit from their `as` parent at runtime", () => {
  test("a builtin parent is inherited, and the child stays an animation", async () => {
    const ctx = await contextOf(`animation slow_fade as fadein with
  timing:
    duration = 3
end
`);
    expect(ctx.animation?.fadein?.keyframes).toEqual([{ opacity: "1" }]);
    expect(ctx.animation?.slow_fade).toMatchObject({
      $type: "animation",
      $name: "slow_fade",
      target: ctx.animation?.fadein?.target,
      keyframes: [{ opacity: "1" }],
      // Its own duration; every other timing field from `fadein`.
      timing: { ...ctx.animation?.fadein?.timing, duration: 3 },
    });
    expect(ctx.fadein).toBeUndefined();
  });

  test("an authored parent animation is inherited, nested fields included", async () => {
    const ctx = await contextOf(`animation glow with
  keyframes:
    from:
      opacity = "0"
    to:
      opacity = "1"
  timing:
    duration = 2
    easing = "linear"
end

animation quick_glow as glow with
  timing:
    duration = 0.5
end
`);
    const quick = ctx.animation?.quick_glow;
    expect(quick).toMatchObject({ $type: "animation", $name: "quick_glow" });
    expect(quick?.keyframes).toEqual([
      { offset: 0, opacity: "0" },
      { offset: 1, opacity: "1" },
    ]);
    expect(quick?.timing).toMatchObject({ duration: 0.5, easing: "linear" });
    // Fields neither block sets come from the type's `$default`.
    expect(quick?.timing?.fill).toBe(ctx.animation?.$default?.timing?.fill);
    expect(ctx.glow).toBeUndefined();
  });

  test("an authored parent theme is inherited", async () => {
    const ctx = await contextOf(`theme dusk with
  colors:
    primary = "#123456"
    secondary = "#654321"
end

theme late_dusk as dusk with
  colors:
    primary = "#000000"
end
`);
    expect(ctx.theme?.late_dusk).toMatchObject({
      $type: "theme",
      colors: { primary: "#000000", secondary: "#654321" },
    });
    expect(ctx.dusk).toBeUndefined();
  });

  test("an authored parent morph is inherited", async () => {
    const ctx = await contextOf(`morph blink with
  method = bend
  keyframes:
    from:
      eyes:
        state = open
    to:
      eyes:
        state = closed
end

morph slow as blink with
  timing:
    duration = 1
end
`);
    expect(ctx.morph?.slow).toMatchObject({
      $type: "morph",
      method: "bend",
      blend: "morph",
      timing: { duration: 1 },
    });
    expect(ctx.morph?.slow?.keyframes).toHaveLength(2);
  });

  test("a parent declared after its child is linked when it registers", async () => {
    const ctx = await contextOf(`morph slow as blink with
  timing:
    duration = 1
end

morph blink with
  method = bend
  keyframes:
    from:
      eyes:
        state = open
    to:
      eyes:
        state = closed
end
`);
    expect(ctx.morph?.slow).toMatchObject({ $type: "morph", method: "bend" });
    expect(ctx.morph?.slow?.keyframes).toHaveLength(2);
  });

  test.each([
    [
      "before",
      `define base as morph with
  method = "bend"
end

morph child as base with
  fallback = cut
end
`,
    ],
    [
      "after",
      `morph child as base with
  fallback = cut
end

define base as morph with
  method = "bend"
end
`,
    ],
  ])("a `define` parent declared %s its child is inherited", async (_, src) => {
    const ctx = await contextOf(src);
    expect(ctx.morph?.child).toMatchObject({
      $type: "morph",
      method: "bend",
      fallback: "cut",
    });
  });

  test("blocks of different types and a variable may share a parent's name", async () => {
    const src = `store base = 1

animation base with
  keyframes:
    from:
      opacity = "0"
    to:
      opacity = "1"
end

animation child as base with
  timing:
    duration = 2
end

morph base with
  method = trace
  keyframes:
    from:
      eyes:
        state = open
    to:
      eyes:
        state = closed
end

morph other as base with
  fallback = cut
end
`;
    expect(compileUI(`${src}${SCENE}`).errors).toEqual([]);
    const ctx = await contextOf(src);
    expect(ctx.animation?.child?.keyframes).toEqual(
      ctx.animation?.base?.keyframes,
    );
    expect(ctx.morph?.other).toMatchObject({ method: "trace", fallback: "cut" });
    expect(ctx.morph?.other?.keyframes).not.toEqual(
      ctx.animation?.base?.keyframes,
    );
  });

  test("a cycle of parents is refused rather than looping", async () => {
    const story = await storyOf(`morph a as b with
  method = bend
end

morph b as a with
  fallback = cut
end
`);
    // `a` runs first and waits for `b`; `b` links to `a`; linking `a` to `b`
    // would close the loop, so `a` keeps inheriting from its type.
    expect(chainOf(story, "$morph_a")).toEqual(["a", "morph"]);
    expect(chainOf(story, "$morph_b")).toEqual(["b", "a", "morph"]);
    const ctx = buildDefinesContext(story) as any;
    expect(ctx.morph?.b).toMatchObject({ fallback: "cut", method: "bend" });
  });

  // A runtime table's OWN value for `key` (not one inherited through
  // `__index`), as plain JS.
  const ownValue = (story: any, global: string, key: string): unknown =>
    story.state.variablesState.GetVariableWithName(global)?.value?.get(key)
      ?.value;

  test.each([
    [
      "before",
      `define base as theme with
  store marker = "original"
end

theme middle as base with
  colors:
    primary = "#000000"
end

theme leaf as middle with
  colors:
    secondary = "#ffffff"
end
`,
    ],
    [
      "after",
      `theme leaf as middle with
  colors:
    secondary = "#ffffff"
end

theme middle as base with
  colors:
    primary = "#000000"
end

define base as theme with
  store marker = "original"
end
`,
    ],
  ])(
    "`store` defaults of a parent declared %s its children become their own",
    async (_, src) => {
      const story = await storyOf(src);
      expect(ownValue(story, "$theme_middle", "marker")).toBe("original");
      expect(ownValue(story, "$theme_leaf", "marker")).toBe("original");
    },
  );

  test("a cycle longer than a chain walk's step limit is still refused", async () => {
    const count = 66;
    const blocks = Array.from(
      { length: count },
      (_, i) => `theme n${i} as n${(i + 1) % count} with
  p${i} = "v${i}"
end
`,
    ).join("\n");
    const story = await storyOf(blocks);
    for (let i = 0; i < count; i += 1) {
      const chain = chainOf(story, `$theme_n${i}`);
      expect(chain).not.toContain("<cycle>");
      expect(chain.at(-1)).toBe("theme");
    }
  });

  test("a parent that never registers leaves the child inheriting from its type", async () => {
    const ctx = await contextOf(`animation lonely as nowhere with
  timing:
    duration = 4
end
`);
    expect(ctx.animation?.lonely).toMatchObject({
      $type: "animation",
      timing: { ...ctx.animation?.$default?.timing, duration: 4 },
    });
    expect(ctx.nowhere).toBeUndefined();
  });
});
