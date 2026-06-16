// Unit tests for the runtime `__def` → JS context converter.
//
// These validate the converter against AUTHORED defines only — the runtime
// implicit parents are empty here (builtin `$default`s are not yet seeded into
// the runtime; that arrives with the builtins-as-Luau-prelude work), so e.g.
// `pan_right` has no inherited `timing`. Full builtin-inheritance coverage
// comes once the prelude populates the type tables; equivalence with the engine
// is ultimately proven by the UI golden-master.

import { describe, expect, test } from "vitest";
import { createHarness } from "../ui/harness/uiTestHarness";
import { buildDefinesContext } from "../../game/core/utils/buildContextFromStory";

function defines(source: string) {
  const harness = createHarness(source);
  const story = (harness.game as any).story ?? (harness.game as any)._story;
  return { harness, story };
}

const SRC = `define pan_right as animation with
  keyframes = {
    background_position = "right"
  }
end

define companion as character with
  store trust = 0
  speak()
    print("hi")
  end
end

define O as companion with
  name = "Orion"
end

define stack as layered_image with
  assets = { pan_right, O }
end

-> start
scene start
  Hello.
end
`;

describe("buildDefinesContext (runtime __def → JS)", () => {
  test("authored defines convert with $type/$name; methods + meta stripped", async () => {
    const { harness, story } = defines(SRC);
    await harness.ready;
    const ctx = buildDefinesContext(story);

    // animation instance: own keyframes preserved (object form), no inherited
    // timing (runtime parent is empty until the prelude seeds builtins).
    expect(ctx["animation"]?.["pan_right"]).toEqual({
      keyframes: { background_position: "right" },
      $type: "animation",
      $name: "pan_right",
    });

    // character with a store prop + a method: store prop copied in, method
    // (closure) skipped, hidden __storeProps/__readProps meta stripped. (A
    // method mid-list must NOT halt the defines after it — `O`/`stack` below.)
    expect(ctx["character"]?.["companion"]).toEqual({
      trust: 0,
      $type: "character",
      $name: "companion",
    });
    expect(ctx["character"]?.["companion"]).not.toHaveProperty("speak");
    expect(ctx["character"]?.["companion"]).not.toHaveProperty("__storeProps");
  });

  test("inheritance: child inherits store defaults + registers under every ancestor", async () => {
    const { harness, story } = defines(SRC);
    await harness.ready;
    const ctx = buildDefinesContext(story);

    const expected = {
      trust: 0, // inherited store default from companion
      name: "Orion", // own
      $type: "companion",
      $name: "O",
    };
    // Registered under the immediate parent AND the grandparent type.
    expect(ctx["companion"]?.["O"]).toEqual(expected);
    expect(ctx["character"]?.["O"]).toEqual(expected);
  });

  test("array-valued prop (struct refs) converts to a JS array of inert refs", async () => {
    const { harness, story } = defines(SRC);
    await harness.ready;
    const ctx = buildDefinesContext(story);

    const stack = ctx["layered_image"]?.["stack"] as any;
    expect(stack?.$name).toBe("stack");
    expect(Array.isArray(stack?.assets)).toBe(true);
    expect(stack.assets).toHaveLength(2);
    // Bare refs lower to inert { $type:"", $name } literals.
    expect(stack.assets[0]).toMatchObject({ $name: "pan_right" });
    expect(stack.assets[1]).toMatchObject({ $name: "O" });
  });

  test("type-namespace tables (implicit parents) are not emitted as entries", async () => {
    const { harness, story } = defines(SRC);
    await harness.ready;
    const ctx = buildDefinesContext(story);
    // `animation`/`character` are type namespaces, never entries under "".
    expect(ctx[""]).toBeUndefined();
    expect(ctx["animation"]).not.toHaveProperty("animation");
    expect(ctx["character"]).not.toHaveProperty("character");
  });
});
