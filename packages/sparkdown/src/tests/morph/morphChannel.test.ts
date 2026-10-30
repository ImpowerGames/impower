import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { parseMorphRecipe } from "../../morph/recipe";
import { createMorphHost, inlineMorphSource } from "../../morph/hosts";
import { MorphBakeService } from "../../morph/service";
import { blinkScript, portrait } from "./fixtures";

const URI = "file:///main.sd";

interface CompileOptions {
  svg?: string;
  served?: boolean;
  skipValidation?: boolean;
  name?: string;
}

function compile(text: string, options: CompileOptions = {}) {
  const svg = options.svg ?? portrait();
  const name = options.name ?? "bunny";
  const compiler = new SparkdownCompiler();
  compiler.configure({
    ...(options.served ? { stripImageData: true } : {}),
    ...(options.skipValidation ? { skipValidation: true } : {}),
    files: [
      { uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" },
      {
        uri: `file:///${name}.svg`,
        type: "image",
        name,
        ext: "svg",
        ...(options.served ? { src: `/file:/local/${name}.svg?v=7-100`, text: svg } : { data: svg }),
      },
    ],
  } as any);
  return compiler.compile({ textDocument: { uri: URI } }).program;
}

const SCRIPT = `${blinkScript()}
[[bunny]]
[[bunny~eyes.closed]]
`;

describe("morph channel", () => {
  test("each morph's recipe travels once, and every variant it plays on gets a compact reference", () => {
    const program = compile(SCRIPT);
    const channel = program.morphs!;
    const recipe = parseMorphRecipe(channel.recipes["blink"]!);
    expect(recipe?.method).toBe("bend");
    expect(recipe?.clips).toEqual([{ between: ["eyelash-left"], targets: ["eyeball-white-left", "pupil-left"] }]);
    const refs = channel.variants["bunny"]!;
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ morph: "blink", image: "bunny", selection: "{}", groups: ["eyes"] });
    expect(refs[0]!.src).toBeUndefined();
    expect(channel.variants["bunny~eyes.closed"]).toBeUndefined();
  });

  test("the channel carries references, never frames or artwork", () => {
    const program = compile(SCRIPT);
    const text = JSON.stringify(program.morphs);
    expect(text).not.toContain('"frames":');
    expect(text).not.toContain('"apertures":');
    expect(text).not.toContain("<svg");
    expect(text.length).toBeLessThan(1500);
  });

  test("a served artwork's reference names the asset service URL the variant is filtered at", () => {
    const program = compile(SCRIPT, { served: true });
    const ref = program.morphs!.variants["bunny"]![0]!;
    const url = new URL(ref.src!, "https://host.invalid");
    expect(url.pathname).toBe("/file:/local/bunny.svg");
    expect(url.searchParams.get("v")).toBe("7-100");
    expect(url.searchParams.get("attributes")).toBe("{}");
    expect(url.searchParams.get("morph")).toBe(program.morphs!.recipes["blink"]);
    expect(url.searchParams.get("key")).toBe(ref.key);
  });

  test("the key moves with the artwork, the recipe and the selection, and not with timing", () => {
    const key = (text: string, svg?: string) => compile(text, svg ? { svg } : {}).morphs!.variants["bunny"]![0]!.key;
    const base = key(SCRIPT);
    expect(key(SCRIPT)).toBe(base);
    expect(key(SCRIPT, portrait({ dx: 21 }))).not.toBe(base);
    expect(key(`${blinkScript("  fallback = cut\n")}\n[[bunny]]\n`)).not.toBe(base);
    expect(key(`${blinkScript("  timing {\n    duration = 2\n  }\n")}\n[[bunny]]\n`)).toBe(base);
  });

  test("images named after object members get references like any other", () => {
    for (const name of ["toString", "constructor"]) {
      const program = compile(`${blinkScript()}\n[[${name}]]\n`, { name });
      const refs = program.morphs!.variants[name];
      expect(refs).toHaveLength(1);
      expect(refs![0]).toMatchObject({ morph: "blink", image: name });
    }
  });

  test("hosts that skip validation still get the channel", () => {
    const program = compile(SCRIPT, { skipValidation: true });
    expect(program.morphs?.variants["bunny"]).toHaveLength(1);
  });

  test("scripts without a morph carry no channel", () => {
    expect(compile("[[bunny]]\n").morphs).toBeUndefined();
  });

  test("an inline host bakes a compiled reference through the shared service", async () => {
    const program = compile(SCRIPT);
    const host = createMorphHost({
      service: new MorphBakeService(),
      channel: () => program.morphs,
      readSource: inlineMorphSource(() => program.context),
    });
    const ref = program.morphs!.variants["bunny"]![0]!;
    const handle = await host.resolve(ref);
    expect(handle.artifact.key).toBe(ref.key);
    expect(handle.artifact.status).toBe("live");
    expect(handle.artifact.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(handle.artifact.diagnostics.every((d) => d.uri === "file:///bunny.svg")).toBe(true);
    handle.release();
  });
});
