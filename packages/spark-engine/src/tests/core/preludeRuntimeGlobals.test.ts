// P5 prerequisite — CHARACTERIZATION (read-only, no production change).
//
// The builtins prelude (builtins.sd) compiled in isolation is a VALID CARRIER
// of the builtin `__def` globals: the program engine's story of its statement
// chunks populates the runtime VM's globals, and buildDefinesContext can
// extract the builtin defines WITH inherited type defaults, so the engine can
// read builtins from the story (a source-injected one) rather than the static
// program.context channel.

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

    requireChunks(off.program);
    requireChunks(on.program);

    // Non-perturbation: program.context (the LSP-only superset the channels are
    // derived from) is byte-identical — the flag only adds builtin globals to
    // the story the program runs, never to the static context.
    expect(JSON.stringify(on.program.context)).toBe(
      JSON.stringify(off.program.context),
    );

    // Flag OFF (today's gap): the user story's `animation` type table is empty,
    // so the authored animation inherits NO timing.
    const offCtx = buildDefinesContext(programStoryOf(off.program) as any);
    expect((offCtx["animation"]?.["my_anim"] as any)?.timing).toBeUndefined();

    // Flag ON: the builtin `animation` define now runs in the SAME story, so the
    // authored animation inherits its timing via the runtime __index chain.
    const onCtx = buildDefinesContext(programStoryOf(on.program) as any);
    const myAnim = onCtx["animation"]?.["my_anim"] as any;
    expect(myAnim?.keyframes).toMatchObject({ background_position: "right" });
    expect(myAnim?.timing).toMatchObject({ fill: "both", direction: "normal" });
  });

  test("cached prelude reuse: warm compiles build the program a fresh compile builds", () => {
    // Fresh compiler → cold compile (parses + caches the prelude).
    const fresh = compileUser(USER_SRC, true);
    // The program's chunks by content (`programContent`: every chunk's
    // instructions, tables and lines, without the chunk, sequence and
    // anonymous symbol ids a compile numbers), which a compile without chunks
    // fails.
    const freshJson = JSON.stringify(programContent(fresh.program.chunks));
    expect(freshJson).toBeTruthy();

    // One long-lived compiler, compiled repeatedly: the 2nd+ compiles reuse the
    // cached prelude parse. The program must stay the one a fresh parse builds
    // (proves resetParsedRuntime + re-splice is sound, no cross-compile bleed).
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
    // A builtin instance authored in the prelude now lives in the user story.
    expect(ctx["color"]?.["red"]).toMatchObject({ value: "rgb(220,38,38)" });
    expect((ctx["config"]?.["ui"] as any)?.breakpoints).toMatchObject({
      sm: 640,
    });
  });
});
