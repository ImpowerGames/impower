import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const URI = "inmemory:///main.sd";

const compile = (text: string) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  });
  const program = compiler.compile({ textDocument: { uri: URI } }).program as any;
  const messages = Object.values(program.diagnostics ?? {})
    .flat()
    .map((d: any) => (typeof d.message === "string" ? d.message : (d.message?.value ?? "")));
  return { program, messages };
};

const STORY = `scene start
  Hi.
end
`;

describe("`morph_frame_rate` in the assets config (#2812)", () => {
  test("is known to the assets config, 24 by default", () => {
    const { program, messages } = compile(STORY);
    expect(messages).toEqual([]);
    expect(program.context.config.assets.morph_frame_rate).toBe(24);
  });

  test("an author's value replaces the default and compiles clean, and a layout can read it", () => {
    const { program, messages } = compile(`define assets as config with
  morph_frame_rate = 12
end

layout main {
  text "{config.assets.morph_frame_rate} frames"
}

${STORY}`);
    expect(messages).toEqual([]);
    expect(program.context.config.assets.morph_frame_rate).toBe(12);
  });
});
