import { describe, expect, test } from "vitest";
import { compileUI, createHarness } from "../ui/harness/uiTestHarness";
import { buildDefinesContext } from "../../game/core/utils/buildContextFromStory";

const SRC = `define pan_left as animation with
  keyframes = { background_position = "left" }
end

animation pan_right {
  keyframes {
    background_position = right
  }
}

animation pan_up {
  keyframes = { background_position = "top" }
}

define empty_frames as animation with
  keyframes = {}
end

define two_frames as animation with
  keyframes = { { opacity = "0" }, { opacity = "1" } }
end

define slide as morph with
  method = "bend"
end


scene start
  Hello.
end
`;

async function runtimeContext() {
  const harness = createHarness(SRC);
  await harness.ready;
  const story = (harness.game as any).story ?? (harness.game as any)._story;
  return buildDefinesContext(story) as Record<string, Record<string, any>>;
}

function compiledContext() {
  const { program } = compileUI(SRC);
  return (program as any).context as Record<string, Record<string, any>>;
}

describe("map-valued animation keyframes lower to a one-element list", () => {
  test("program.context holds a list for every authoring form", () => {
    const animation = compiledContext()["animation"]!;
    expect(animation["pan_left"]!.keyframes).toEqual([
      { background_position: "left" },
    ]);
    expect(animation["pan_right"]!.keyframes).toEqual([
      { background_position: "right" },
    ]);
    expect(animation["pan_up"]!.keyframes).toEqual([
      { background_position: "top" },
    ]);
    expect(animation["empty_frames"]!.keyframes).toEqual([{}]);
    expect(animation["two_frames"]!.keyframes).toEqual([
      { opacity: "0" },
      { opacity: "1" },
    ]);
  });

  test("the runtime story table holds a list for every authoring form", async () => {
    const animation = (await runtimeContext())["animation"]!;
    expect(animation["pan_left"]!.keyframes).toEqual([
      { background_position: "left" },
    ]);
    expect(animation["pan_right"]!.keyframes).toEqual([
      { background_position: "right" },
    ]);
    expect(animation["pan_up"]!.keyframes).toEqual([
      { background_position: "top" },
    ]);
    expect(animation["empty_frames"]!.keyframes).toEqual([{}]);
    expect(animation["two_frames"]!.keyframes).toEqual([
      { opacity: "0" },
      { opacity: "1" },
    ]);
  });

  test("every builtin animation reaches the runtime with a keyframe list", async () => {
    const animation = (await runtimeContext())["animation"]!;
    for (const [name, struct] of Object.entries(animation)) {
      expect(Array.isArray(struct.keyframes), name).toBe(true);
    }
  });

  test("morph keyframes keep their own representation", async () => {
    const compiled = compiledContext()["morph"]!["slide"]!;
    const runtime = (await runtimeContext())["morph"]!["slide"]!;
    expect(compiled.keyframes).toEqual({});
    expect(runtime.keyframes).toEqual({});
  });
});
