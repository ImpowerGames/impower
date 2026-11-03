import { describe, expect, test } from "vitest";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import { MAIN_URI, programCompiler } from "../program/programHarness";

interface Diag {
  message: string;
  severity: number;
  startLine: number;
  endLine: number;
  endCharacter: number;
}

function compile(source: string): { program: SparkProgram; diags: Diag[] } {
  const { program } = programCompiler({ [MAIN_URI]: source }).compile();
  const diags: Diag[] = [];
  for (const docDiagnostics of Object.values(program.diagnostics ?? {})) {
    for (const d of docDiagnostics as any[]) {
      diags.push({
        message: typeof d.message === "string" ? d.message : d.message?.value,
        severity: d.severity,
        startLine: d.range?.start?.line,
        endLine: d.range?.end?.line,
        endCharacter: d.range?.end?.character,
      });
    }
  }
  return { program, diags };
}

const errors = (source: string) =>
  compile(source).diags.filter((d) => d.severity === 1);

const SCENE = "\nscene start\n  Hi.\nend\n";

const SPARKLE: Record<string, string> = {
  layout: "layouts",
  component: "components",
  screen: "screens",
};

const withoutOffsets = (value: unknown): unknown =>
  JSON.parse(
    JSON.stringify(value, (key, v) =>
      key === "span" || key === "exprId" ? undefined : v,
    ),
  );

const compiled = (program: SparkProgram, kind: string, name: string) => ({
  context: (program.context as any)?.[kind]?.[name],
  sparkle: SPARKLE[kind]
    ? withoutOffsets((program as any).sparkle?.[SPARKLE[kind]!]?.[name])
    : undefined,
});

const messages = (diags: Diag[]) =>
  diags.map((d) => `${d.severity} ${d.startLine} ${d.message}`);

const PAIRS: {
  label: string;
  kind: string;
  name: string;
  header: string;
  body: string;
  extra?: string;
}[] = [
  {
    label: "a style with a parent and nested blocks",
    kind: "style",
    name: "panel",
    header: "style panel as base",
    body: "  text-color = white\n  corner = 8px\n  background-color = rgb(0 0 0 / 40%)\n  > text { text-size = 24px }\n  @hovered { opacity = 0.5 }\n",
    extra: "style base {\n}\n",
  },
  {
    label: "an animation with `to { … }` keyframes",
    kind: "animation",
    name: "flip",
    header: "animation flip",
    body: "  keyframes {\n    from { transform = scaleX(1) }\n    40% { opacity = 0.5 } -- halfway\n    to { transform = scaleX(-1) }\n  }\n  timing { duration = 0.4 }\n",
  },
  {
    label: "a theme with a list",
    kind: "theme",
    name: "dusk",
    header: "theme dusk",
    body: "  color = #112233\n  radius = 8px\n  links {\n    https://example.com\n    12:30\n  }\n",
  },
  {
    label: "a morph",
    kind: "morph",
    name: "blink",
    header: "morph blink",
    body: "  method = bend\n  keyframes {\n    { offset = 0; eyes { state = eyes.open } }\n    { offset = 0.4; eyes { state = eyes.closed } }\n  }\n  clips {\n    { between { eyelash-left }; targets { eyeball-white-left; pupil-left } }\n  }\n",
  },
  {
    label: "a layout with `in` and `as` and control blocks",
    kind: "layout",
    name: "title",
    header: "layout title in menu as base",
    body: '  column #child-gap=16 {\n    text "My Game"\n    button "Play" @click=start\n    if visible then\n      text "Shown"\n    end\n  }\n  for item in items do\n    text item\n  end\n  row.footer { text "v1" }\n',
    extra: "screen menu {\n}\nlayout base {\n}\n",
  },
  {
    label: "a component with parameters and a parent",
    kind: "component",
    name: "card",
    header: "component card(title) as box",
    body: "  box.card {\n    text title\n    slot\n  }\n",
    extra: "component box {\n}\n",
  },
  {
    label: "an empty screen",
    kind: "screen",
    name: "menu",
    header: "screen menu",
    body: "",
  },
];

describe("a struct keyword's brace body compiles as its `with … end` body does", () => {
  for (const pair of PAIRS) {
    test(pair.label, () => {
      const extra = pair.extra ?? "";
      const withForm = compile(`${pair.header} with\n${pair.body}end\n${extra}${SCENE}`);
      const braceForm = compile(`${pair.header} {\n${pair.body}}\n${extra}${SCENE}`);
      const expected = compiled(withForm.program, pair.kind, pair.name);
      expect(expected.context).toBeDefined();
      expect(compiled(braceForm.program, pair.kind, pair.name)).toEqual(expected);
      expect(messages(braceForm.diags)).toEqual(messages(withForm.diags));
    });
  }

  test("a one-line style separates its entries as an inner block does", () => {
    const oneLine = compile(`style blue { text-color = white; corner = 8px }\n${SCENE}`);
    const lines = compile(`style blue {\n  text-color = white\n  corner = 8px\n}\n${SCENE}`);
    expect((oneLine.program.context as any)?.style?.blue).toEqual(
      (lines.program.context as any)?.style?.blue,
    );
    expect(errors(`style blue { text-color = white; corner = 8px }\n${SCENE}`)).toEqual([]);
  });

  test("a morph's brace body counts as its body opener", () => {
    const morph = PAIRS.find((pair) => pair.kind === "morph")!;
    const found = errors(`${morph.header} {\n${morph.body}}\n${SCENE}`).filter((e) =>
      e.message.includes("after the morph's name"),
    );
    expect(found).toEqual([]);
  });
});

describe("an unindented entry named like a declaration keyword", () => {
  const COMPONENT = "component theme(label) {\n  text label\n}\n";
  for (const [label, entries] of [
    ["with a block comment after it", ["theme --[[ note ]]", "theme --[====[ note ] extra ]====]"]],
    ["with a word after it", ["theme label", "screen label"]],
  ] as const) {
    test(`${label} stays in the brace body`, () => {
      const body = `${entries.join("\n")}\n`;
      const extra = "component screen(label) {\n  text label\n}\n";
      const withForm = compile(`${COMPONENT}${extra}layout main with\n${body}end\n${SCENE}`);
      const braceForm = compile(`${COMPONENT}${extra}layout main    {\n${body}}\n${SCENE}`);
      const expected = compiled(withForm.program, "layout", "main");
      expect((expected.sparkle as any)?.children?.length).toBeGreaterThanOrEqual(entries.length);
      expect(compiled(braceForm.program, "layout", "main")).toEqual(expected);
      expect(messages(braceForm.diags)).toEqual(messages(withForm.diags));
    });
  }
});

describe("a closed brace body whose entries are shaped like declaration headers", () => {
  const ENTRIES = [
    "theme label {",
    "}",
    "function f()",
    "run x",
    "include shared.sd",
    "store label",
    "store trust: number = 5",
    "style panel as base {",
    "}",
    "define hero as character with",
    "type K = number",
    "& store x = 5",
  ];
  const at = (indent: string) => ENTRIES.map((entry) => `${indent}${entry}`).join("\n");
  for (const [kind, name] of [
    ["style", "panel"],
    ["layout", "main"],
    ["theme", "dusk"],
  ] as const) {
    test(`compiles the same in a ${kind} at column 0 as indented`, () => {
      const columnZero = compile(`${kind} ${name} {\n${at("")}\n}\n${SCENE}`);
      const indented = compile(`${kind} ${name} {\n${at("  ")}\n}\n${SCENE}`);
      expect(compiled(columnZero.program, kind, name).context).toBeDefined();
      expect(compiled(columnZero.program, kind, name)).toEqual(
        compiled(indented.program, kind, name),
      );
      expect(messages(columnZero.diags)).toEqual(messages(indented.diags));
      expect(
        columnZero.diags.filter((d) => d.message.includes("missing its closing `}`")),
      ).toEqual([]);
    });
  }
});

describe("valid brace bodies report nothing", () => {
  const FORMS = [
    ["style", "style s", "  color = red"],
    ["layout", "layout main", "  box {\n  }"],
    ["screen", "screen menu", ""],
    ["component", "component card(t)", "  box {\n  }"],
    ["animation", "animation a", "  timing { duration = 1 }"],
    ["theme", "theme t", "  x = 1"],
  ] as const;
  for (const [keyword, header, body] of FORMS) {
    test(`an empty one-line ${keyword}`, () => {
      expect(errors(`${header} {}\n${SCENE}`)).toEqual([]);
    });
    test(`a multi-line ${keyword}`, () => {
      expect(errors(`${header} {\n${body}\n}\n${SCENE}`)).toEqual([]);
    });
    test(`a ${keyword} with a comment after its \`}\``, () => {
      expect(errors(`${header} {\n${body}\n} -- note\n${SCENE}`)).toEqual([]);
    });
  }
});

describe("a brace body opened in the wrong place", () => {
  test("a `{` on the line after the header is an error at the brace, and the next block compiles on its own", () => {
    const source = `style panel\n{\n  corner = 8px\n}\n\nstyle after {\n  corner = 4px\n}\n${SCENE}`;
    const errs = errors(source);
    expect(errs.map((e) => [e.startLine, e.message])).toEqual([
      [1, "A style's `{` goes at the end of its header line: `style NAME [as PARENT] {`."],
    ]);
    const context = compile(source).program.context as any;
    expect(context?.style?.panel?.corner).toBe("8px");
    expect(context?.style?.after?.corner).toBe("4px");
  });

  test("a header with both `with` and `{` is an error on the header", () => {
    for (const [header, keyword] of [
      ["style panel with {", "style"],
      ["layout hud with {", "layout"],
    ]) {
      const errs = errors(`${header}\n  corner = 8px\n}\n${SCENE}`);
      expect(errs).toHaveLength(1);
      expect(errs[0]!.startLine).toBe(0);
      expect(errs[0]!.message).toContain(
        `This ${keyword} opens its body with both \`with\` and \`{\``,
      );
    }
  });

  test("an unreadable header names the brace form", () => {
    const errs = errors(`style panel: {\n  corner = 8px\n}\n${SCENE}`).filter((e) =>
      e.message.includes("cannot be read past"),
    );
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toContain("`style NAME [as PARENT] {`");
  });
});

describe("an unclosed brace body", () => {
  const MESSAGE = (keyword: string, closers: string) =>
    `This ${keyword} is missing its closing \`}\`. Without it, every line up to the next \`scene\` or \`branch\`, line that starts with ${closers}, or the end of the file is read as part of this ${keyword}.`;
  const missing = (source: string) =>
    errors(source).filter((e) => e.message.includes("missing its closing `}`"));

  test("is an error on its header line that says where the block runs to", () => {
    const struct = missing(`style broken {\n  text-color = white\n${SCENE}`);
    expect(struct.map((e) => [e.startLine, e.endLine, e.endCharacter, e.message])).toEqual([
      [0, 0, "style broken {".length, MESSAGE("style", "`end`")],
    ]);
    const sparkle = missing(`layout list {\n  row {\n    text "a"\n  }\n${SCENE}`);
    expect(sparkle.map((e) => [e.startLine, e.message])).toEqual([
      [0, MESSAGE("layout", "`end`, `else`, `elseif` or `case`")],
    ]);
  });

  test("runs to the next scene, whatever the lines before it hold or how they are indented", () => {
    const source = [
      "style broken {",
      "  text-color = white",
      "",
      "style after {",
      "  corner = 8px",
      "}",
      "store trust: number = 5",
      "function f() end",
      SCENE,
    ].join("\n");
    const { program, diags } = compile(source);
    expect(messages(diags)).toEqual([`1 0 ${MESSAGE("style", "`end`")}`]);
    expect((program.context as any)?.style?.after).toBeUndefined();
  });

  test("runs to the next branch", () => {
    const source = `layout list {\n  row { text "a" }\n\nbranch side\n  Hey.\nend\n${SCENE}`;
    expect(missing(source).map((e) => e.startLine)).toEqual([0]);
  });

  test("runs to a line that starts with `end`, indented or not", () => {
    for (const end of ["end", "    end"]) {
      const source = `theme open { color = red\n${end}\n${SCENE}`;
      expect(missing(source).map((e) => e.startLine), end).toEqual([0]);
      expect((compile(source).program.context as any)?.theme?.open?.color, end).toBe("red");
    }
  });

  test("runs to the end of the file", () => {
    expect(missing(`${SCENE}\nscreen tail {\n  x = 1\n`).map((e) => e.startLine)).toEqual([5]);
  });
});
