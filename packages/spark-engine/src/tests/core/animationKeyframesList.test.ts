import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { compileUI, createHarness } from "../ui/harness/uiTestHarness";
import { programStoryOf } from "../harness/compileProgram";
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

async function runtimeContext(source = SRC) {
  const harness = createHarness(source);
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

  test("a root default whose keyframes come from a variable reaches the runtime as a list", async () => {
    const animation = (
      await runtimeContext(`store frame = { opacity = "0.5" }

define animation with
  keyframes = frame
end

animation inherited {
}


scene start
  Hello.
end
`)
    )["animation"]!;
    expect(animation["inherited"]!.keyframes).toEqual([{ opacity: "0.5" }]);
  });

  test("a define whose parent is another animation define reaches the runtime as a list", async () => {
    const animation = (
      await runtimeContext(`define fancy as animation with
  keyframes = { opacity = "1" }
end

define glow as fancy with
  keyframes = { opacity = "0" }
end


scene start
  Hello.
end
`)
    )["animation"]!;
    expect(animation["glow"]!.keyframes).toEqual([{ opacity: "0" }]);
  });

  test("an animation without keyframes in a runtime without the builtin prelude gets an empty list", () => {
    const compiler = new SparkdownCompiler();
    compiler.configure({
      useBuiltinsPrelude: true,
      seedBuiltinsIntoStory: false,
      files: [
        {
          uri: "file:///main.sd",
          type: "script",
          name: "main",
          ext: "sd",
          text: `animation no_frames {
}


scene start
  Hello.
end
`,
          version: 0,
          languageId: "sparkdown",
        } as any,
      ],
    });
    const { program } = compiler.compile({
      textDocument: { uri: "file:///main.sd" },
    });
    const runtime = buildDefinesContext(programStoryOf(program) as any) as any;
    expect(runtime["animation"]["no_frames"].keyframes).toEqual([]);
  });

  test("morph keyframes keep their own representation", async () => {
    const compiled = compiledContext()["morph"]!["slide"]!;
    const runtime = (await runtimeContext())["morph"]!["slide"]!;
    expect(compiled.keyframes).toEqual({});
    expect(runtime.keyframes).toEqual({});
  });
});
