import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { File } from "../../compiler/types/File";
import { NO_START_SCENE_MESSAGE } from "../../compiler/utils/startScene";
import { GUIDE_DIR, guideExamples } from "./guideExamples";

const URI = "file:///project/main.sd";
const CHAPTER = "Framings.md";
const EDITOR_GUIDE = join(GUIDE_DIR, "../../../../impower-dev/docs/sparkdown-guide.md");

const picture = (name: string): File => ({
  uri: `file:///project/assets/${name}.png`,
  type: "image",
  name,
  ext: "png",
  src: `/file:/local/assets/${name}.png`,
});

const PICTURES = ["bg_apartment", "bg_apartment_dim", "bunny_serious", "sky_night"].map(picture);

function compile(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", version: 1, languageId: "sparkdown", text }, ...PICTURES],
  });
  const program = compiler.compile({ textDocument: { uri: URI } }).program;
  const messages = (program.diagnostics?.[URI] ?? [])
    .map((d) => `${d.range.start.line + 1}: ${typeof d.message === "string" ? d.message : d.message.value}`)
    .filter((m) => !m.endsWith(NO_START_SCENE_MESSAGE));
  return { program, messages };
}

const read = (file: string) => readFileSync(file, "utf8");
const examples = () => guideExamples(CHAPTER);

describe("the Framings chapter (I-2482)", () => {
  test("has examples that define, show at and travel to a framing", () => {
    const all = examples().map((e) => e.code).join("\n");
    expect(examples().length).toBeGreaterThanOrEqual(8);
    expect(all).toMatch(/^framing sofa \{$/m);
    expect(all).toMatch(/\[\[show backdrop bg_apartment at right\]\]/);
    expect(all).toMatch(/\[\[animate backdrop to left over 5s\]\]/);
    expect(all).toMatch(/\[\[animate backdrop to right over 2s\]\]/);
    expect(all).toMatch(/\[\[animate backdrop to sofa over 1s\]\]/);
    expect(all).toMatch(/ wait\]\]/);
    expect(all).toMatch(/ to \w+ over [\d.]+s with shake\]\]/);
  });

  test.each(examples().map((e) => [`${CHAPTER}:${e.line}`, e.code] as const))("%s compiles with no diagnostic", (_, code) => {
    expect(compile(code).messages).toEqual([]);
  });

  test("lists the nine built-in framings with the values the compiler gives them", () => {
    const rows = [...read(join(GUIDE_DIR, CHAPTER)).matchAll(/^\| `(\w+)` \| `([\d.]+%)` \| `([\d.]+%)` \|$/gm)].map((m) => [m[1], m[2], m[3]]);
    const framings = compile("scene start\nend\n").program.context?.["framing"] ?? {};
    const builtins = Object.entries(framings)
      .filter(([name]) => name !== "$default")
      .map(([name, f]: [string, any]) => [name, f.x, f.y]);
    expect(rows).toHaveLength(9);
    expect(rows).toEqual(builtins);
    expect(Object.values(framings).every((f: any) => f.zoom === 1)).toBe(true);
  });

  test("is listed in the guide's index and named by the Animation chapter for pan and zoom", () => {
    expect(read(join(GUIDE_DIR, "README.md"))).toMatch(/\]\(\.\/Framings\.md\)/);
    const animation = read(join(GUIDE_DIR, "AnimationTheme.md"));
    expect(animation).toMatch(/pan and zoom[^\n]*\]\(\.\/Framings\.md\)/i);
    expect(animation).not.toMatch(/align_(?:left|center|right)/);
  });

  test("the in-editor guide shows a picture at a framing and travels it to one, and both lines compile", () => {
    const directives = [...read(EDITOR_GUIDE).matchAll(/^`(\[\[[^`]*\]\])`$/gm)].map((m) => m[1]!);
    const at = directives.find((d) => /^\[\[show backdrop \w+ at \w+\]\]$/.test(d));
    const to = directives.find((d) => /^\[\[animate backdrop to \w+ over [\d.]+s\]\]$/.test(d));
    expect(at).toBeDefined();
    expect(to).toBeDefined();
    expect(compile(`scene start\n  ${at}\n  ${to}\n  Hello.\nend\n`).messages).toEqual([]);
  });
});
