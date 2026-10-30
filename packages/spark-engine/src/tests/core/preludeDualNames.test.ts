import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { programStoryOf } from "../harness/compileProgram";
import { convertDefine } from "../../game/core/utils/buildContextFromStory";

const URI = "file:///main.sd";

function compileStory(source: string): any {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: true,
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  const result = compiler.compile({ textDocument: { uri: URI } });
  return programStoryOf(result.program);
}

const metaVal = (v: any, key: string): any =>
  v?.metatable?.value?.get?.(key) ?? null;
const metaStr = (v: any, key: string): string =>
  String(metaVal(v, key)?.value ?? "");

function findDefine(story: any, name: string, parent?: string): any {
  const globals: Map<string, any> =
    story.state.variablesState["_globalVariables"];
  let found: any = undefined;
  for (const v of globals.values()) {
    if (
      v &&
      metaStr(v, "__define") === name &&
      (parent === undefined || metaStr(v, "__defineParent") === parent)
    ) {
      found = v;
    }
  }
  return found;
}

describe("same-TYPE builtin override with a choice in the story", () => {
  const SOURCE = `define ambient as channel with
  loop = true
end


scene start
  Hello.
  choose
    + [Go]
      Went.
  then
    Done.
end
`;

  test("the story still compiles and the authored override wins", () => {
    const story = compileStory(SOURCE);
    const override = findDefine(story, "ambient", "channel");
    expect(override).toBeDefined();
    const struct: any = convertDefine(override, story);
    expect(struct.loop).toBe(true);
    expect(struct.mixer).toBe("sound");
    expect(struct.play_behavior).toBe("stack");
  });
});

describe("as-parent resolution for a dual-defined type name", () => {
  const SOURCE = `define narrator as typewriter with
  letter_pause = 0.05
end


scene start
  Hello.
end
`;

  test("an authored `as typewriter` chains through the ROOT type", () => {
    const story = compileStory(SOURCE);
    const narrator = findDefine(story, "narrator", "typewriter");
    expect(narrator).toBeDefined();
    const parent = metaVal(narrator, "__index");
    expect(parent).toBeTruthy();
    expect(metaStr(parent, "__define")).toBe("typewriter");
    expect(metaStr(parent, "__defineParent")).toBe("");
  });

  test("the chain carries pacing AND the tuned voice payload", () => {
    const story = compileStory(SOURCE);
    const narrator = findDefine(story, "narrator", "typewriter");
    const struct: any = convertDefine(narrator, story);
    expect(struct.letter_pause).toBe(0.05);
    expect(struct.phrase_pause_scale).toBe(5);
    expect(struct.em_dash_pause_scale).toBe(16);
    expect(struct.shape).toBe("tangent");
    expect(struct.envelope?.attack).toBe(0.01);
  });
});

describe("override back-fill for a dual-defined builtin instance", () => {
  const SOURCE = `define typewriter as channel with
  loop = true
end


scene start
  Hello.
end
`;

  test("a partial override keeps the builtin instance's other fields", () => {
    const story = compileStory(SOURCE);
    const override = findDefine(story, "typewriter", "channel");
    expect(override).toBeDefined();
    const struct: any = convertDefine(override, story);
    expect(struct.loop).toBe(true);
    expect(struct.mixer).toBe("sound");
    expect(struct.play_behavior).toBe("replace");
  });
});
