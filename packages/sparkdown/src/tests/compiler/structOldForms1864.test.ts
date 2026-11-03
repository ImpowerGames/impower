import { describe, expect, test } from "vitest";
import { MAIN_URI, programCompiler } from "../program/programHarness";

interface Diag {
  message: string;
  severity: number;
  startLine: number;
  startCharacter: number;
  endCharacter: number;
}

function errors(source: string): Diag[] {
  const { program } = programCompiler({ [MAIN_URI]: source }).compile();
  const diags: Diag[] = [];
  for (const docDiagnostics of Object.values(program.diagnostics ?? {})) {
    for (const d of docDiagnostics as any[]) {
      if (d.severity !== 1) continue;
      diags.push({
        message: typeof d.message === "string" ? d.message : d.message?.value,
        severity: d.severity,
        startLine: d.range?.start?.line,
        startCharacter: d.range?.start?.character,
        endCharacter: d.range?.end?.character,
      });
    }
  }
  return diags;
}

const SCENE = "\nscene start\n  Hi.\nend\n";

const braceForm = (keyword: string) =>
  `${keyword === "animation" ? "An" : "A"} ${keyword} body goes in braces: \`${keyword} NAME { … }\`.`;

const keywordForm = (type: string) =>
  `${type === "animation" ? "An" : "A"} ${type} is declared with its own keyword: \`${type} NAME { … }\`. \`define\` bodies are Luau and cannot hold style values.`;

describe("a struct keyword written with `with … end` reports the brace form on its header", () => {
  const CASES: [string, string][] = [
    ["style", "style panel with\n  text-color = white\nend\n"],
    ["animation", "animation flip with\n  timing { duration = 0.4 }\nend\n"],
    ["theme", "theme dusk with\n  color = #112233\nend\n"],
    [
      "morph",
      "morph blink with\n  method = bend\n  keyframes {\n    { offset = 0; eyes { state = eyes.open } }\n    { offset = 0.4; eyes { state = eyes.closed } }\n  }\n  clips {\n    { between { eyelash-left }; targets { eyeball-white-left; pupil-left } }\n  }\nend\n",
    ],
    ["layout", 'layout main with\n  text "a"\nend\n'],
    ["component", "component card(title) with\n  text title\nend\n"],
    ["screen", "screen menu with end\n"],
  ];
  for (const [keyword, source] of CASES) {
    test(keyword, () => {
      expect(errors(`${source}${SCENE}`)).toEqual([
        {
          message: braceForm(keyword),
          severity: 1,
          startLine: 0,
          startCharacter: 0,
          endCharacter: source.indexOf("\n"),
        },
      ]);
    });
  }

  test("a header with neither `with` nor `{` reports the same error", () => {
    expect(errors(`layout main\n  text "a"\nend\n${SCENE}`).map((e) => [e.startLine, e.message])).toEqual([
      [0, braceForm("layout")],
    ]);
    expect(errors(`screen menu\nend\n${SCENE}`).map((e) => [e.startLine, e.message])).toEqual([
      [0, braceForm("screen")],
    ]);
  });

  test("a header with both `with` and `{` reports the same error", () => {
    expect(errors(`style panel with {\n  text-color = white\n}\n${SCENE}`).map((e) => [e.startLine, e.message])).toEqual([
      [0, braceForm("style")],
    ]);
  });
});

describe("`define … as` a struct type reports the keyword form on its parent", () => {
  for (const [type, source] of [
    ["style", 'define panel as style with\n  color = "red"\nend\n'],
    ["animation", "define flip as animation with\n  timing = { duration = 0.2 }\nend\n"],
    ["morph", "define base as morph with\n  method = \"bend\"\nend\n"],
  ] as const) {
    test(type, () => {
      const from = source.indexOf(` as ${type}`) + " as ".length;
      expect(errors(`${source}${SCENE}`)).toEqual([
        {
          message: keywordForm(type),
          severity: 1,
          startLine: 0,
          startCharacter: from,
          endCharacter: from + type.length,
        },
      ]);
    });
  }

  test("a define whose parent is not a struct type compiles", () => {
    expect(
      errors(
        `define hero as character with\n  name = "Hero"\nend\n\ndefine red as color with\n  value = "#ff0000"\nend\n${SCENE}`,
      ),
    ).toEqual([]);
  });
});
