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

    expect(ctx["animation"]?.["pan_right"]).toMatchObject({
      keyframes: { background_position: "right" },
      $type: "animation",
      $name: "pan_right",
    });

    expect(ctx["character"]?.["companion"]).toMatchObject({
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
      trust: 0,
      name: "Orion",
      $type: "companion",
      $name: "O",
    };
    expect(ctx["companion"]?.["O"]).toMatchObject(expected);
    expect(ctx["character"]?.["O"]).toMatchObject(expected);
  });

  test("array-valued prop (struct refs) converts to a JS array of inert refs", async () => {
    const { harness, story } = defines(SRC);
    await harness.ready;
    const ctx = buildDefinesContext(story);

    const stack = ctx["layered_image"]?.["stack"] as any;
    expect(stack?.$name).toBe("stack");
    expect(Array.isArray(stack?.assets)).toBe(true);
    expect(stack.assets).toHaveLength(2);
    expect(stack.assets[0]).toMatchObject({ $name: "pan_right" });
    expect(stack.assets[1]).toMatchObject({ $name: "O" });
  });

  test("type-namespace tables (implicit parents) are not emitted as entries", async () => {
    const { harness, story } = defines(SRC);
    await harness.ready;
    const ctx = buildDefinesContext(story);
    expect(ctx[""]).toBeUndefined();
    expect(ctx["animation"]).not.toHaveProperty("animation");
    expect(ctx["character"]).not.toHaveProperty("character");
  });

  test("root type tables emit their own props as the type's $default", async () => {
    const { harness, story } = defines(SRC);
    await harness.ready;
    const ctx = buildDefinesContext(story);

    const tw = ctx["typewriter"]?.["$default"] as any;
    expect(tw).toBeDefined();
    expect(tw.$name).toBe("$default");
    expect(tw.phrase_pause_scale).toBe(5);
    expect(tw.em_dash_pause_scale).toBe(16);
    expect(tw.min_syllable_length).toBe(3);

    const prosody = ctx["prosody"]?.["$default"] as any;
    expect(prosody).toBeDefined();
    expect(prosody.question).toBeTruthy();

    const inflection = ctx["inflection"]?.["$default"] as any;
    expect(inflection).toBeDefined();
    expect(Array.isArray(inflection.question)).toBe(true);

    expect(ctx["color"]?.["$default"]).toBeUndefined();
  });
});
