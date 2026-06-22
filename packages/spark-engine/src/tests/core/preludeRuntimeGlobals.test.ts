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
