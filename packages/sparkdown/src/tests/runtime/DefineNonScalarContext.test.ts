// An OOP define's NON-scalar properties (Luau tables / arrays, and the
// references inside them) must reach `program.context` so the engine's spec
// system can consume them. The motivating case: a `layered_image`'s
// `assets = { … }` table — `UIModule.getImageAssets` does
// `Object.values(layeredImage.assets)` and reads each entry's `$type`/`$name`,
// so a missing `assets` crashes backdrop rendering (`Object.values(undefined)`).
//
// `coerceScalarLiteral` only emits scalars; `expressionToContextValue` fills
// the gap, mirroring `StructPropertyDefinition.GetValue`'s reference rule:
// a bare reference → `{ $type: "", $name }` (empty `$type` = engine searches
// every type by name), a typed reference `t.n` → `{ $type: "t", $name: "n" }`.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

const compile = (text: string) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: "inmemory:///main.sd",
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      } as any,
    ],
  });
  return compiler.compile({ textDocument: { uri: "inmemory:///main.sd" } });
};

describe("OOP define non-scalar context emission", () => {
  test("a layered_image `assets` table emits {$type,$name} references", () => {
    const result = compile(`define bg_print_shop as layered_image with
  assets = {
    bg_int_print_shop_night__base,
    bg_int_print_shop_night__prop,
  }
end
`);
    const li = result.program.context?.["layered_image"]?.["bg_print_shop"];
    expect(li).toBeDefined();
    expect(li!["$type"]).toBe("layered_image");
    expect(li!["$name"]).toBe("bg_print_shop");
    // Array-style table → JS array; bare refs → { $type: "", $name }.
    expect(li!["assets"]).toEqual([
      { $type: "", $name: "bg_int_print_shop_night__base" },
      { $type: "", $name: "bg_int_print_shop_night__prop" },
    ]);
  });

  test("scalar props still emit alongside non-scalar ones", () => {
    const result = compile(`define hero as character with
  name = "HERO"
  color = "red"
  tags = { "brave", "kind" }
end
`);
    const c = result.program.context?.["character"]?.["hero"];
    expect(c).toBeDefined();
    expect(c!["name"]).toBe("HERO");
    expect(c!["color"]).toBe("red");
    expect(c!["tags"]).toEqual(["brave", "kind"]);
  });

  test("a nested keyed table emits as a JS object", () => {
    const result = compile(`define ui_panel as layered_image with
  assets = {
    base = bg_base,
    overlay = bg_overlay,
  }
end
`);
    const li = result.program.context?.["layered_image"]?.["ui_panel"];
    expect(li!["assets"]).toEqual({
      base: { $type: "", $name: "bg_base" },
      overlay: { $type: "", $name: "bg_overlay" },
    });
  });

  test("a define whose table holds DOTTED struct refs still compiles to a runnable story", () => {
    // `audio.mus_a_bass` is a struct reference, not a runtime global lookup.
    // Evaluating it live at init would index the `audio` type global (nil,
    // since nothing inherits from `audio`) and throw — unsetting
    // `program.compiled`. The runtime `__def` table must instead hold inert
    // `{ $type, $name }` literals. Guards that the story is runnable.
    const result = compile(`-> main

define mus_a_group as layered_audio with
  assets = {
    audio.mus_a_bass,
    audio.mus_a_flute,
  }
end

scene main
  Hello.
  done
end
`);
    // Context carries the typed refs.
    const la = result.program.context?.["layered_audio"]?.["mus_a_group"];
    expect(la!["assets"]).toEqual([
      { $type: "audio", $name: "mus_a_bass" },
      { $type: "audio", $name: "mus_a_flute" },
    ]);
    // And the story actually compiled + runs (no init throw).
    expect((result.program as any).compiled).toBeDefined();
    const story = new RuntimeStory((result.program as any).compiled);
    const errors: string[] = [];
    story.onError = (m: string) => errors.push(m);
    const out = story.ContinueMaximally();
    expect(errors).toEqual([]);
    expect(out).toContain("Hello.");
  });
});
