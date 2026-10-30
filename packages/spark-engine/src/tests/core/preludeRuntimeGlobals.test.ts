import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { programContent } from "@impower/sparkdown/src/tests/programListing";
import { programStoryOf, requireChunks } from "../harness/compileProgram";
import { buildDefinesContext } from "../../game/core/utils/buildContextFromStory";

const BUILTINS_PRELUDE = readFileSync(
  new URL(
    "../../../../sparkdown/src/compiler/builtins/builtins.sd",
    import.meta.url,
  ),
  "utf8",
);

const PRELUDE_URI = "file:///__builtins__.sd";

function compilePrelude() {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: false,
    definitions: { builtins: {} as any },
    files: [
      {
        uri: PRELUDE_URI,
        type: "script",
        name: "__builtins__",
        ext: "sd",
        text: BUILTINS_PRELUDE,
        version: 0,
        languageId: "sparkdown",
      } as any,
    ],
  });
  return compiler.compile({ textDocument: { uri: PRELUDE_URI } });
}

describe("P5 prerequisite: the prelude's story carries builtin __def globals", () => {
  test("the prelude compiles to statement chunks", () => {
    const result = compilePrelude();
    expect(result.program.chunks).toBeTruthy();
  });

  test("instantiating the prelude story populates _globalVariables with defines", () => {
    const result = compilePrelude();
    const story = programStoryOf(result.program, "prelude");
    const globals = (story as any).state?.variablesState?._globalVariables;
    expect(globals instanceof Map).toBe(true);
    expect((globals as Map<string, unknown>).size).toBeGreaterThan(0);
  });

  test("buildDefinesContext on the prelude story extracts builtin instances + props", () => {
    const result = compilePrelude();
    const story = programStoryOf(result.program, "prelude");
    const ctx = buildDefinesContext(story as any);

    const ui = ctx["config"]?.["ui"] as any;
    expect(ui).toMatchObject({
      styles_element_name: "styles",
      layouts_element_name: "layouts",
      $type: "config",
      $name: "ui",
    });
    expect(ui?.breakpoints).toMatchObject({ sm: 640, md: 768, lg: 1024 });

    const interpreter = ctx["config"]?.["interpreter"] as any;
    expect(interpreter?.directives).toMatchObject({ title: "^", heading: "$" });

    expect(ctx["color"]?.["red"]).toMatchObject({
      value: "rgb(220,38,38)",
      $type: "color",
      $name: "red",
    });
  });
});

const USER_URI = "file:///main.sd";

function compileUser(source: string, seed: boolean) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: seed,
    files: [
      {
        uri: USER_URI,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 0,
        languageId: "sparkdown",
      } as any,
    ],
  });
  return compiler.compile({ textDocument: { uri: USER_URI } });
}

const USER_SRC = `define my_anim as animation with
  keyframes = {
    background_position = "right"
  }
end


scene start
  Hello.
end
`;

describe("P5 P1: seedBuiltinsIntoStory source-injects the prelude", () => {
  test("flag ON: authored `as animation` inherits the builtin timing at runtime", () => {
    const off = compileUser(USER_SRC, false);
    const on = compileUser(USER_SRC, true);

    requireChunks(off.program);
    requireChunks(on.program);

    expect(JSON.stringify(on.program.context)).toBe(
      JSON.stringify(off.program.context),
    );

    const offCtx = buildDefinesContext(programStoryOf(off.program) as any);
    expect((offCtx["animation"]?.["my_anim"] as any)?.timing).toBeUndefined();

    const onCtx = buildDefinesContext(programStoryOf(on.program) as any);
    const myAnim = onCtx["animation"]?.["my_anim"] as any;
    expect(myAnim?.keyframes).toMatchObject({ background_position: "right" });
    expect(myAnim?.timing).toMatchObject({ fill: "both", direction: "normal" });
  });

  test("cached prelude reuse: warm compiles build the program a fresh compile builds", () => {
    const fresh = compileUser(USER_SRC, true);
    const freshJson = JSON.stringify(programContent(fresh.program.chunks));
    expect(freshJson).toBeTruthy();

    const compiler = new SparkdownCompiler();
    compiler.configure({
      useBuiltinsPrelude: true,
      seedBuiltinsIntoStory: true,
      files: [
        {
          uri: USER_URI,
          type: "script",
          name: "main",
          ext: "sd",
          text: USER_SRC,
          version: 0,
          languageId: "sparkdown",
        } as any,
      ],
    });
    for (let i = 0; i < 3; i += 1) {
      const r = compiler.compile({ textDocument: { uri: USER_URI } });
      expect(JSON.stringify(programContent(r.program.chunks))).toBe(freshJson);
    }
  });

  test("flag ON: builtin instances are present in the user story too", () => {
    const on = compileUser(USER_SRC, true);
    const ctx = buildDefinesContext(programStoryOf(on.program) as any);
    expect(ctx["color"]?.["red"]).toMatchObject({ value: "rgb(220,38,38)" });
    expect((ctx["config"]?.["ui"] as any)?.breakpoints).toMatchObject({
      sm: 640,
    });
  });
});
