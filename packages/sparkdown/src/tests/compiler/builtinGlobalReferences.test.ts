// A reference to a builtin define (`game.loading.percent`, `assets.beat_timeout`)
// must compile clean whether or not the compile seeds the builtins into the
// story. The editor's diagnostics compiler stays unseeded for keystroke
// latency; the runtime always seeds, so the names are real there. Without the
// declaration-only markers this file pins, the unseeded compile reported
// "Cannot find item or path named `game.loading.percent`" on the very
// binding the loading screen documents.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const URI = "inmemory:///main.sd";

const messages = (program: any): string[] => {
  const out: string[] = [];
  for (const list of Object.values(program.diagnostics ?? {})) {
    for (const d of list as any[]) {
      out.push(typeof d.message === "string" ? d.message : d.message?.value ?? "");
    }
  }
  return out;
};

const compile = (text: string, seed: boolean) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: seed,
    files: [
      { uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" },
    ],
  });
  const result = compiler.compile({ textDocument: { uri: URI } });
  return { program: result.program, messages: messages(result.program) };
};

const LAYOUT = `layout loading with
  loading_backdrop:
  loading_content:
    text "Loading {game.loading.name}... {game.loading.percent}%"
    loading_bar:
      loading_fill #transform="scaleX({game.loading.progress})"
end

scene A
  & local ahead = assets.predict_distance
  Hi.
end
`;

describe("references to builtin defines", () => {
  test.each([
    ["seeded", true],
    ["unseeded", false],
  ])("compile clean when the builtins are %s", (_label, seed) => {
    const { program, messages } = compile(LAYOUT, seed);
    expect(program.compiled).toBeTruthy();
    expect(messages.filter((m) => m.includes("Cannot find"))).toEqual([]);
  });

  test("an unknown name still warns in an unseeded compile", () => {
    const { messages } = compile(
      `layout loading with\n  text "{nope.field}"\nend\n\nscene A\n  Hi.\nend\n`,
      false,
    );
    expect(messages.some((m) => m.includes("Cannot find item or path named `nope.field`"))).toBe(true);
  });

  test("an authored define may still take a builtin's name in an unseeded compile", () => {
    const { program, messages } = compile(
      `define assets as config with\n  predict_distance = 4\nend\n\nscene A\n  & local ahead = assets.predict_distance\n  Hi.\nend\n`,
      false,
    );
    expect(program.compiled).toBeTruthy();
    expect(messages.filter((m) => m.includes("Duplicate identifier"))).toEqual([]);
    expect(messages.filter((m) => m.includes("Cannot find"))).toEqual([]);
  });
});
