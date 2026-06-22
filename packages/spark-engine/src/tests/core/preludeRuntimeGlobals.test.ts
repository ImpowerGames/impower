// P5 prerequisite — CHARACTERIZATION (read-only, no production change).
//
// The builtins prelude (builtins.sd) is compiled once in isolation; its
// `compiled` runtime story is cached but currently instantiated by NOBODY (the
// engine reads builtin defines from the static, lossy program.context channel
// instead). This test proves whether that cached prelude compiled story is a
// VALID CARRIER of the builtin `__def` globals — i.e. instantiating it populates
// the runtime VM's globals and buildDefinesContext can extract the builtin
// defines WITH inherited type defaults. If so, the engine can read builtins from
// a separately-instantiated prelude Story (or from a source-injected story)
// rather than the static channel — the open question P5 must settle.

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { Story } from "@impower/sparkdown/src/inkjs/engine/Story";
import { buildDefinesContext } from "../../game/core/utils/buildContextFromStory";

const BUILTINS_PRELUDE = readFileSync(
  new URL(
    "../../../../sparkdown/src/compiler/builtins/builtins.sd",
    import.meta.url,
  ),
  "utf8",
);

const PRELUDE_URI = "file:///__builtins__.sd";

/** Compile builtins.sd in isolation — exactly as SparkdownCompiler.getCompiledPrelude
 *  does (useBuiltinsPrelude:false so it doesn't recurse into itself). */
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

describe("P5 prerequisite: prelude compiled story carries builtin __def globals", () => {
  test("the prelude compiles to a runtime story", () => {
    const result = compilePrelude();
    expect(result.program.compiled).toBeTruthy();
  });

  test("instantiating the prelude story populates _globalVariables with defines", () => {
    const result = compilePrelude();
    const story = new Story(result.program.compiled as any);
    const globals = (story as any).state?.variablesState?._globalVariables;
    expect(globals instanceof Map).toBe(true);
    expect((globals as Map<string, unknown>).size).toBeGreaterThan(0);
  });

  test("buildDefinesContext on the prelude story extracts builtin instances + props", () => {
    const result = compilePrelude();
    const story = new Story(result.program.compiled as any);
    const ctx = buildDefinesContext(story as any);

    // `ui as config` → registered under the `config` type with its own props.
    const ui = ctx["config"]?.["ui"] as any;
    expect(ui).toMatchObject({
      styles_element_name: "styles",
      layouts_element_name: "layouts",
      $type: "config",
      $name: "ui",
    });
    expect(ui?.breakpoints).toMatchObject({ sm: 640, md: 768, lg: 1024 });

    // `interpreter as config` → its directives/fallbacks tables.
    const interpreter = ctx["config"]?.["interpreter"] as any;
    expect(interpreter?.directives).toMatchObject({ title: "^", heading: "$" });

    // `red as color` → instance under the `color` type with its value.
    expect(ctx["color"]?.["red"]).toMatchObject({
      value: "rgb(220,38,38)",
      $type: "color",
      $name: "red",
    });
  });
});

const USER_URI = "file:///main.sd";

/** Compile a user program with the builtins prelude; `seed` toggles the P1
 *  source-injection (seedBuiltinsIntoStory). */
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

-> start
scene start
  Hello.
end
`;

describe("P5 P1: seedBuiltinsIntoStory source-injects the prelude", () => {
  test("flag ON: authored `as animation` inherits the builtin timing at runtime", () => {
    const off = compileUser(USER_SRC, false);
    const on = compileUser(USER_SRC, true);

    expect(off.program.compiled).toBeTruthy();
    expect(on.program.compiled).toBeTruthy();

    // Non-perturbation: the static program.defines channel (derived from
    // program.context via mergePreludeContext) is byte-identical — the flag
    // only adds builtin globals to program.compiled.
    expect(JSON.stringify(on.program.defines)).toBe(
      JSON.stringify(off.program.defines),
    );

    // Flag OFF (today's gap): the user story's `animation` type table is empty,
    // so the authored animation inherits NO timing.
    const offCtx = buildDefinesContext(new Story(off.program.compiled as any));
    expect((offCtx["animation"]?.["my_anim"] as any)?.timing).toBeUndefined();

    // Flag ON: the builtin `animation` define now runs in the SAME story, so the
    // authored animation inherits its timing via the runtime __index chain.
    const onCtx = buildDefinesContext(new Story(on.program.compiled as any));
    const myAnim = onCtx["animation"]?.["my_anim"] as any;
    expect(myAnim?.keyframes).toMatchObject({ background_position: "right" });
    expect(myAnim?.timing).toMatchObject({ fill: "both", direction: "normal" });
  });

  test("flag ON: builtin instances are present in the user story too", () => {
    const on = compileUser(USER_SRC, true);
    const ctx = buildDefinesContext(new Story(on.program.compiled as any));
    // A builtin instance authored in the prelude now lives in the user story.
    expect(ctx["color"]?.["red"]).toMatchObject({ value: "rgb(220,38,38)" });
    expect((ctx["config"]?.["ui"] as any)?.breakpoints).toMatchObject({
      sm: 640,
    });
  });
});
