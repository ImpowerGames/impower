import { describe, expect, test } from "vitest";
import { testCompiler, testStory } from "../engineUnderTest";

const compile = (text: string) => {
  const compiler = testCompiler();
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
    const result = compile(`define mus_a_group as layered_audio with
  assets = {
    audio.mus_a_bass,
    audio.mus_a_flute,
  }
end

scene start
  Hello.
  done
end
`);
    const la = result.program.context?.["layered_audio"]?.["mus_a_group"];
    expect(la!["assets"]).toEqual([
      { $type: "audio", $name: "mus_a_bass" },
      { $type: "audio", $name: "mus_a_flute" },
    ]);
    expect(result.program.chunks).toBeDefined();
    const story = testStory(result.program.chunks);
    const errors: string[] = [];
    story.onError = (m: string) => errors.push(m);
    const out = story.ContinueMaximally();
    expect(errors).toEqual([]);
    expect(out).toContain("Hello.");
  });

  test("a SCALAR bare reference emits a {$type,$name} object, not a string", () => {
    const result = compile(`define bunny_angry as filtered_image with
  image = bunny_realization
  attributes = {
    "angry",
  }
end
`);
    const fi = result.program.context?.["filtered_image"]?.["bunny_angry"];
    expect(fi).toBeDefined();
    expect(fi!["image"]).toEqual({ $type: "", $name: "bunny_realization" });
    expect(fi!["attributes"]).toEqual(["angry"]);
  });

  test("a quoted string scalar stays a string (reference fix must not capture it)", () => {
    const result = compile(`define panel as character with
  name = "PANEL"
  color = "surface"
end
`);
    const c = result.program.context?.["character"]?.["panel"];
    expect(c!["name"]).toBe("PANEL");
    expect(c!["color"]).toBe("surface");
  });
});
