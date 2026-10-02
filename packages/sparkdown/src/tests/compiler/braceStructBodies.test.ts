import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { compileSource } from "./compileSnapshot";

// #1223: `style`, `animation`, `theme` and `morph` bodies accept brace blocks
// (#1222). A brace body lowers to the struct its multiline blocks lowers to, in
// both struct readers: the style reader (`lowerStructBody`) and the typed
// reader behind `animation`, `theme` and `morph` (`lowerStructBodyTyped`).

type StructType = "style" | "animation" | "theme" | "morph";

function structOf(source: string, type: StructType, name: string): any {
  const entry = compileSource(source).find(
    (e) => e.block?.context?.[type]?.[name],
  );
  return entry?.block?.context?.[type]?.[name];
}

const URI = "file:///main.sd";

interface Found {
  message: string;
  severity: number | undefined;
  line: number;
  character: number;
  text: string;
}

/** Every diagnostic a full compile reports, with the text it underlines. */
function diagnosticsOf(text: string): Found[] {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as any);
  const program = compiler.compile({ textDocument: { uri: URI } }).program;
  const lines = text.split("\n");
  return (program.diagnostics?.[URI] ?? []).map((d) => {
    const { start, end } = d.range;
    return {
      message: typeof d.message === "string" ? d.message : d.message.value,
      severity: d.severity,
      line: start.line,
      character: start.character,
      text:
        start.line === end.line
          ? lines[start.line]!.slice(start.character, end.character)
          : lines[start.line]!.slice(start.character),
    };
  });
}

const errorsOf = (text: string) =>
  diagnosticsOf(text).filter((d) => d.severity === 1);

const STYLE_INDENTED = `style button with
  cursor = pointer
  &.secondary {
    background-color = slate_50
  }
  > text.label {
    text-weight = 600
  }
  @hovered, @pressed {
    background-color = sky_50
  }
  @screen-size(sm) {
    width = 100%
    > text {
      font-size = 12px
    }
  }
end
`;

const STYLE_BRACED = `style button with
  cursor = pointer
  &.secondary { background-color = slate_50 }
  > text.label { text-weight = 600 }
  @hovered, @pressed { background-color = sky_50 }
  @screen-size(sm) {
    width = 100%
    > text { font-size = 12px }
  }
end
`;

const LIST_INDENTED = `animation pulse with
  keyframes {
    {
      offset = 0
      opacity = 0
    }
    {
      offset = 0.5
      opacity = 1
      transform = "scale(1.1)"
    }
    {
      offset = 1
      opacity = 0
    }
  }
  timing {
    duration = 0.4
    easing = ease-in-out
    iterations = infinite
  }
end
`;

const LIST_BRACED = `animation pulse with
  keyframes {
    { offset = 0; opacity = 0 }
    {
      offset = 0.5
      opacity = 1
      transform = "scale(1.1)"
    }
    { offset = 1; opacity = 0 }
  }
  timing {
    duration = 0.4
    easing = ease-in-out
    iterations = infinite
  }
end
`;

const POSITIONS_INDENTED = `animation fade with
  keyframes {
    from {
      opacity = 0
    }
    40% {
      opacity = 0.5
    }
    to {
      opacity = 1
    }
  }
  timing {
    duration = 0.4
    easing = ease-in-out
  }
end
`;

const POSITIONS_BRACED = `animation fade with
  keyframes {
    from { opacity = 0 }
    40% { opacity = 0.5 }
    to { opacity = 1 }
  }
  timing = {
    duration = 0.4,
    easing = ease-in-out,
  }
end
`;

const THEME_INDENTED = `theme dusk with
  colors {
    primary = red
    surface = "#101010"
  }
  spacing {
    sm = 4
    md = 8
  }
  fonts {
    "Courier Prime"
    serif
  }
end
`;

const THEME_BRACED = `theme dusk with
  colors {
    primary = red
    surface = "#101010"
  }
  spacing { sm = 4; md = 8 }
  fonts { "Courier Prime"; serif }
end
`;

describe("a brace body lowers to the struct of its multiline blocks", () => {
  test("a style with nested selectors, states and a breakpoint", () => {
    const indented = structOf(STYLE_INDENTED, "style", "button");
    expect(indented["&.secondary"]).toEqual({ "background-color": "slate_50" });
    expect(structOf(STYLE_BRACED, "style", "button")).toEqual(indented);
  });

  test("an animation whose keyframes are a list, with timing", () => {
    const indented = structOf(LIST_INDENTED, "animation", "pulse");
    expect(indented.keyframes).toHaveLength(3);
    expect(structOf(LIST_BRACED, "animation", "pulse")).toEqual(indented);
  });

  test("an animation whose keyframes use positions, with timing", () => {
    const indented = structOf(POSITIONS_INDENTED, "animation", "fade");
    expect(indented.keyframes.map((k: any) => k.offset)).toEqual([0, 0.4, 1]);
    expect(structOf(POSITIONS_BRACED, "animation", "fade")).toEqual(indented);
  });

  test("a theme", () => {
    const indented = structOf(THEME_INDENTED, "theme", "dusk");
    expect(indented.fonts).toEqual(["Courier Prime", "serif"]);
    expect(structOf(THEME_BRACED, "theme", "dusk")).toEqual(indented);
  });

  test("a selector holding `--` keeps it in the header", () => {
    const braced = `style t with
  &.card--large { opacity = 0.5 }
  &.primary--active {
    opacity = 1
  }
end
`;
    const indented = `style t with
  &.card--large {
    opacity = 0.5
  }
  &.primary--active {
    opacity = 1
  }
end
`;
    const struct = structOf(braced, "style", "t");
    expect(struct["&.card--large"]).toEqual({ opacity: "0.5" });
    expect(struct).toEqual(structOf(indented, "style", "t"));
    expect(errorsOf(braced)).toEqual([]);
    // An `=` inside a selector does not start a value.
    const attribute = `style t with
  &[data-label=true--suffix] { color = red }
end
`;
    expect(structOf(attribute, "style", "t")).toEqual(
      structOf(
        `style t with
  &[data-label=true--suffix] {
    color = red
  }
end
`,
        "style",
        "t",
      ),
    );
    expect(structOf(attribute, "style", "t")["&[data-label=true--suffix]"]).toEqual({
      color: "red",
    });
    // A quoted attribute value is part of the selector, braces and all.
    const quoted = `style t with
  &[data-label="x"] { color = red }
  &[data-label="true--suffix"] { color = green }
  &[data-label="a b;{"] { color = blue }
end
`;
    const quotedIndented = `style t with
  &[data-label="x"] {
    color = red
  }
  &[data-label="true--suffix"] {
    color = green
  }
  &[data-label="a b;{"] {
    color = blue
  }
end
`;
    expect(structOf(quoted, "style", "t")).toEqual(
      structOf(quotedIndented, "style", "t"),
    );
    expect(structOf(quoted, "style", "t")['&[data-label="x"]']).toEqual({
      color: "red",
    });
    expect(errorsOf(quoted)).toEqual([]);
    // So is a single-quoted one, and the rules after it are kept.
    const single = `style t with
  &[data-label='a;b'] { opacity = 0.5 }
  &[data-label='space ; { --'], &[data-kind="x"] = { opacity = 0.25 }
  > text { text-color = white; text-size = 24px }
end
`;
    const singleIndented = `style t with
  &[data-label='a;b'] {
    opacity = 0.5
  }
  &[data-label='space ; { --'], &[data-kind="x"] {
    opacity = 0.25
  }
  > text {
    text-color = white
    text-size = 24px
  }
end
`;
    expect(structOf(single, "style", "t")).toEqual(
      structOf(singleIndented, "style", "t"),
    );
    expect(Object.keys(structOf(single, "style", "t"))).toEqual(
      expect.arrayContaining(["&[data-label='a;b']", "> text"]),
    );
    expect(errorsOf(single)).toEqual([]);
    // A quoted key is a block header too, with or without `=`.
    for (const type of ["theme", "style"] as const) {
      const quotedKey = `${type} t with
  "quoted key" { v = 1 }
  "other" = { w = 2 }
end
`;
      const quotedKeyMultiline = `${type} t with
  "quoted key" {
    v = 1
  }
  "other" {
    w = 2
  }
end
`;
      expect(structOf(quotedKey, type, "t"), type).toEqual(
        structOf(quotedKeyMultiline, type, "t"),
      );
      expect(Object.keys(structOf(quotedKey, type, "t")), type).toEqual(
        expect.arrayContaining(['"quoted key"', '"other"']),
      );
      expect(errorsOf(quotedKey), type).toEqual([]);
    }
  });

  test("a block may open after a `;` on a body line", () => {
    const braced = `animation a with
  target = layer.self; timing {
    duration = 1
  }
end
`;
    const indented = `animation a with
  target = layer.self
  timing {
    duration = 1
  }
end
`;
    expect(structOf(braced, "animation", "a")).toEqual(
      structOf(indented, "animation", "a"),
    );
    expect(errorsOf(braced)).toEqual([]);
  });

  test("a brace body reports what its multiline blocks reports", () => {
    const messages = (text: string) =>
      diagnosticsOf(text).map((d) => d.message);
    for (const [indented, braced, type, name] of [
      [STYLE_INDENTED, STYLE_BRACED, "style", "button"],
      [LIST_INDENTED, LIST_BRACED, "animation", "pulse"],
      [POSITIONS_INDENTED, POSITIONS_BRACED, "animation", "fade"],
      [THEME_INDENTED, THEME_BRACED, "theme", "dusk"],
    ] as const) {
      // The brace body is read as blocks, so the comparison below is between
      // two readings of the same struct, not two bodies that both fail to read.
      expect(structOf(braced, type, name), braced).toEqual(
        structOf(indented, type, name),
      );
      expect(messages(braced), braced).toEqual(messages(indented));
      expect(errorsOf(braced), braced).toEqual([]);
    }
  });
});

describe("block spellings", () => {
  test("`header = { … }` lowers like `header { … }`", () => {
    const withEquals = structOf(
      `animation a with
  timing = { duration = 1; delay = 2 }
  keyframes = {
    from = { opacity = 0 }
    to = { opacity = 1 }
  }
end
`,
      "animation",
      "a",
    );
    const without = structOf(
      `animation a with
  timing { duration = 1; delay = 2 }
  keyframes {
    from { opacity = 0 }
    to { opacity = 1 }
  }
end
`,
      "animation",
      "a",
    );
    expect(withEquals).toEqual(without);
    expect(withEquals.timing).toEqual({ duration: 1, delay: 2 });
    const style = (text: string) => structOf(text, "style", "s");
    expect(style("style s with\n  &.a = { color = red }\nend\n")).toEqual(
      style("style s with\n  &.a { color = red }\nend\n"),
    );
  });

  test("a one-line block and a nested one-line block lower like their multi-line forms", () => {
    const oneLine = structOf(
      `morph m with
  keyframes { { offset = 0; eyes { state = open; translate = 0 8px } }; { offset = 1; eyes { state = closed } } }
  timing { duration = 1; delay = 0.5 }
end
`,
      "morph",
      "m",
    );
    const multiLine = structOf(
      `morph m with
  keyframes {
    {
      offset = 0
      eyes {
        state = open
        translate = 0 8px
      }
    }
    {
      offset = 1
      eyes {
        state = closed
      }
    }
  }
  timing {
    duration = 1
    delay = 0.5
  }
end
`,
      "morph",
      "m",
    );
    expect(oneLine).toEqual(multiLine);
    expect(oneLine.keyframes[0]).toEqual({
      offset: 0,
      eyes: { state: "open", translate: "0 8px" },
    });
  });

  test("an unquoted value ends at `;` and at the block's `}`, and a quoted value may hold `{`, `}` and `;`", () => {
    const braced = `style s with
  &.a { color = red; content = "a { b } ; c"; width = 10px }
end
`;
    const style = structOf(braced, "style", "s");
    expect(style["&.a"]).toEqual({
      color: "red",
      content: "a { b } ; c",
      width: "10px",
    });
    // A full compile reports what the multiline form of the same body reports.
    const indented = `style s with
  &.a {
    color = red
    content = "a { b } ; c"
    width = 10px
  }
end
`;
    expect(structOf(indented, "style", "s")).toEqual(style);
    const messages = (text: string) =>
      diagnosticsOf(text).map((d) => `${d.severity} ${d.message}`);
    expect(messages(braced)).toEqual(messages(indented));
    const animation = structOf(
      `animation a with
  timing { easing = "steps(2; x)"; duration = 3 }
end
`,
      "animation",
      "a",
    );
    expect(animation.timing).toEqual({ easing: "steps(2; x)", duration: 3 });
  });

  test("a `--` comment inside a block is not part of any value", () => {
    const animation = structOf(
      `animation a with
  timing {
    -- how long it plays
    duration = 3 -- seconds
    delay = 1; -- then this
  }
end
`,
      "animation",
      "a",
    );
    expect(animation.timing).toEqual({ duration: 3, delay: 1 });
  });

  test("a `--` right after a number, boolean or quoted value begins a comment, as in the multiline form", () => {
    const braced = `theme t with
  a { x = 1-- } ; comment
    y = true-- }
    z = "q"-- }
    w = var(--gap)
  }
  list { 2-- } ; comment
  }
end
`;
    const indented = `theme t with
  a {
    x = 1-- } ; comment
    y = true-- }
    z = "q"-- }
    w = var(--gap)
  }
  list {
    2-- } ; comment
  }
end
`;
    const struct = structOf(braced, "theme", "t");
    expect(struct.a).toEqual({ x: 1, y: true, z: "q", w: "var(--gap)" });
    // A whitespace-led `//` is a comment too, in both forms.
    const slashBraced = `theme t with
  colors {
    value = 1 // } note
    // a whole-line note }
    next = 2
    list { red // } note
    }
  }
end
`;
    const slashIndented = `theme t with
  colors {
    value = 1 // } note
    next = 2
    list {
      red // } note
    }
  }
end
`;
    expect(structOf(slashBraced, "theme", "t")).toEqual(
      structOf(slashIndented, "theme", "t"),
    );
    expect(structOf(slashBraced, "theme", "t").colors).toEqual({
      value: 1,
      next: 2,
      list: ["red"],
    });
    expect(errorsOf(slashBraced)).toEqual([]);
    // After a whole literal and whitespace, `//` begins a comment even with no
    // whitespace after it, as the multiline form's literal value rules read it.
    const literalBraced = `theme t with
  colors {
    a = 1 //c }
    b = "q" //c }
    c = true //c }
  }
end
`;
    const literalMultiline = `theme t with
  colors {
    a = 1 //c }
    b = "q" //c }
    c = true //c }
  }
end
`;
    expect(structOf(literalBraced, "theme", "t")).toEqual(
      structOf(literalMultiline, "theme", "t"),
    );
    expect(structOf(literalBraced, "theme", "t").colors).toEqual({
      a: 1,
      b: "q",
      c: true,
    });
    expect(errorsOf(literalBraced)).toEqual([]);
    expect(errorsOf(literalMultiline)).toEqual([]);
    // A value the readers do not take as a literal (`+1`) reads as the same
    // text in both forms.
    const notLiteralBraced = `theme t with
  colors {
    c = +1--c
    d = +1//c
  }
end
`;
    const notLiteralIndented = `theme t with
  colors {
    c = +1--c
    d = +1//c
  }
end
`;
    expect(structOf(notLiteralBraced, "theme", "t")).toEqual(
      structOf(notLiteralIndented, "theme", "t"),
    );
    expect(structOf(notLiteralBraced, "theme", "t").colors).toEqual({
      c: "+1--c",
      d: "+1//c",
    });
    expect(errorsOf(notLiteralBraced)).toEqual([]);
    // A `//` directly after a literal begins a comment in the brace form. The
    // indented form's literal value rules mean the same, but the tree engine
    // cuts their node short there, so it reads `1//c` as `1/` and `true//c` as
    // false; the brace form reads the literal.
    const adjacent = `theme t with
  colors { a = 1//c }
    b = true//c }
  }
end
`;
    expect(structOf(adjacent, "theme", "t").colors).toEqual({ a: 1, b: true });
    expect(errorsOf(adjacent)).toEqual([]);
    expect(struct.list).toEqual([2]);
    expect(struct).toEqual(structOf(indented, "theme", "t"));
    expect(errorsOf(braced)).toEqual([]);
  });
});

describe("commas", () => {
  test("a comma at the end of a line and a comma directly before `}` are ignored", () => {
    const text = `animation a with
  timing {
    duration = 1,
    delay = 2,
  }
  keyframes { from { opacity = 0, }; to { opacity = 1 }, }
end
`;
    const struct = structOf(text, "animation", "a");
    expect(struct.timing).toEqual({ duration: 1, delay: 2 });
    expect(struct.keyframes).toEqual([
      { opacity: 0, offset: 0 },
      { opacity: 1, offset: 1 },
    ]);
    expect(errorsOf(text)).toEqual([]);
  });

  test("a comma before a comment is a trailing comma", () => {
    const text = `theme t with
  colors {
    value = 1, // trailing } {
    other = 2, -- trailing } {
    list { red, // } note
      blue, -- } note
    }
  }
end
`;
    expect(errorsOf(text)).toEqual([]);
    expect(structOf(text, "theme", "t").colors).toEqual({
      value: 1,
      other: 2,
      list: ["red", "blue"],
    });
  });

  test("a comma between two properties on one line is one error that names `;`", () => {
    const text = `animation a with
  timing { duration = 1, delay = 2 }
end
`;
    const errors = errorsOf(text);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ line: 1, text: "," });
    expect(errors[0]!.message).toContain("`;`");
    // Both entries are still read.
    expect(structOf(text, "animation", "a").timing).toEqual({
      duration: 1,
      delay: 2,
    });
    // Any key a property may have starts the next entry.
    for (const key of ['"b"', "$b", '["b"]', "2"]) {
      const keyed = `theme t with
  g { a = 1, ${key} = 2 }
end
`;
      const keyedErrors = errorsOf(keyed);
      expect(keyedErrors, key).toHaveLength(1);
      expect(keyedErrors[0], key).toMatchObject({ line: 1, text: "," });
      expect(keyedErrors[0]!.message, key).toContain("`;`");
      expect(structOf(keyed, "theme", "t").g.a, key).toBe(1);
    }
    // A key with a non-ASCII letter starts the next entry too, and the
    // entries after it are kept.
    const unicode = `theme t with
  g { a = 1, 名 = 2; tail = 3 }
end
`;
    const unicodeErrors = errorsOf(unicode);
    expect(unicodeErrors).toHaveLength(1);
    expect(unicodeErrors[0]).toMatchObject({ line: 1, text: "," });
    expect(structOf(unicode, "theme", "t").g).toMatchObject({ a: 1, tail: 3 });
  });

  test("a comma between two list values on one line is one error that names `;`", () => {
    const text = `morph m with
  method = match
  keyframes {
    from { eyes { state = open } }
    to { eyes { state = closed } }
  }
  clips {
    { between { a }; targets { b, c } }
  }
end
`;
    const errors = errorsOf(text).filter((d) => d.message.includes("`;`"));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ line: 7, text: "," });
    expect(structOf(text, "morph", "m").clips).toEqual([
      { between: ["a"], targets: ["b", "c"] },
    ]);
    // A comma before a `{ … }` entry separates two entries; it does not end
    // a header, quoted or not, so the container stays a list.
    for (const value of ['"a"', "a"]) {
      const beforeObject = `theme t with
  entries { ${value}, { v = 1 } }
end
`;
      const objectErrors = errorsOf(beforeObject);
      expect(objectErrors, value).toHaveLength(1);
      expect(objectErrors[0], value).toMatchObject({ line: 1, text: "," });
      expect(objectErrors[0]!.message, value).toContain("`;`");
      expect(structOf(beforeObject, "theme", "t").entries, value).toEqual([
        "a",
        { v: 1 },
      ]);
    }
  });

  test("a comma between a property and a nested block is one error that names `;`, and the block keeps its own header", () => {
    const style = `style banner with
  &.card { opacity = 0.5, > text { text-color = red } }
end
`;
    const styleErrors = errorsOf(style);
    expect(styleErrors).toHaveLength(1);
    expect(styleErrors[0]).toMatchObject({ line: 1, text: "," });
    expect(styleErrors[0]!.message).toContain("`;`");
    expect(structOf(style, "style", "banner")["&.card"]).toEqual({
      opacity: "0.5",
      "> text": { "text-color": "red" },
    });

    const animation = `animation a with
  timing { duration = 1, nested { delay = 2 } }
end
`;
    const animationErrors = errorsOf(animation);
    expect(animationErrors).toHaveLength(1);
    expect(animationErrors[0]).toMatchObject({ line: 1, text: "," });
    expect(structOf(animation, "animation", "a").timing).toEqual({
      duration: 1,
      nested: { delay: 2 },
    });
  });

  test("a comma inside a property's value stays part of the value", () => {
    const text = `style s with
  &.a {
    transition-property = background-color, opacity
    font-family = "Courier Prime", serif
  }
end
`;
    expect(structOf(text, "style", "s")["&.a"]).toEqual({
      "transition-property": "background-color, opacity",
      "font-family": '"Courier Prime", serif',
    });
    expect(errorsOf(text)).toEqual([]);
  });
});

describe("unbalanced braces", () => {
  test("an unclosed `{` is an error on that brace, and the next declaration compiles with its own content", () => {
    const text = `animation broken with
  keyframes {
    from { opacity = 0 }
    to { opacity = 1
  }
end

animation after with
  timing {
    duration = 2
  }
end
`;
    const errors = errorsOf(text);
    const unclosed = errors.filter((d) => d.message.includes("closing `}`"));
    expect(unclosed).toHaveLength(1);
    expect(unclosed[0]).toMatchObject({ line: 1, character: 12, text: "{" });
    expect(structOf(text, "animation", "after")).toEqual({
      $type: "animation",
      $name: "after",
      timing: { duration: 2 },
    });
  });

  test("an unclosed `{` on the last block ends at the declaration's `end`", () => {
    const text = `animation broken with
  timing {
    duration = 1
end

animation after with
  timing { duration = 2 }
end
`;
    const unclosed = errorsOf(text).filter((d) =>
      d.message.includes("closing `}`"),
    );
    expect(unclosed).toMatchObject([{ line: 1, text: "{" }]);
    expect(structOf(text, "animation", "broken").timing).toEqual({
      duration: 1,
    });
    expect(structOf(text, "animation", "after").timing).toEqual({
      duration: 2,
    });
  });

  test("a `}` at the end of a line outside every block is invalid syntax, not part of a value", () => {
    const afterClose = `animation a with
  timing {
    duration = 1 }
    delay = 2 }
end
`;
    expect(errorsOf(afterClose)).toMatchObject([
      { message: "Invalid syntax", line: 3, character: 14, text: "}" },
    ]);
    const scalar = `theme t with
  value = 1 }
end
`;
    expect(errorsOf(scalar)).toMatchObject([
      { message: "Invalid syntax", line: 1, character: 12, text: "}" },
    ]);
    expect(structOf(scalar, "theme", "t").value).toBe(1);
    // A `--` or `//` inside a value is not a comment, so a `}` after it is
    // still stray.
    const inValue = `theme t with
  good { width = var(--gap) }
  width = var(--gap) }
  height = var(gap) }
  link = http://example.com }
end
`;
    expect(errorsOf(inValue)).toMatchObject([
      { message: "Invalid syntax", line: 2, character: 21, text: "}" },
      { message: "Invalid syntax", line: 3, character: 20, text: "}" },
      { message: "Invalid syntax", line: 4, character: 28, text: "}" },
    ]);
    expect(structOf(inValue, "theme", "t")).toMatchObject({
      good: { width: "var(--gap)" },
      width: "var(--gap)",
      height: "var(gap)",
      link: "http://example.com",
    });
    // `--` after a letter or a digit inside a word is part of the value.
    const inWord = `theme t with
  a = blue--gap }
  b = foo1--bar }
  c = labelN--suffix }
end
`;
    expect(errorsOf(inWord).map((d) => [d.message, d.line, d.text])).toEqual([
      ["Invalid syntax", 1, "}"],
      ["Invalid syntax", 2, "}"],
      ["Invalid syntax", 3, "}"],
    ]);
    expect(structOf(inWord, "theme", "t")).toMatchObject({
      a: "blue--gap",
      b: "foo1--bar",
      c: "labelN--suffix",
    });
    // Only a whole literal value is ended by a `--` right after it, wherever
    // an `=` or a `-` stands in the text.
    const midValue = `theme t with
  font = Arial 1--display }
  dash = Arial - 1--display }
  eq = Arial x=1--display }
end
`;
    expect(errorsOf(midValue).map((d) => [d.message, d.line, d.text])).toEqual([
      ["Invalid syntax", 1, "}"],
      ["Invalid syntax", 2, "}"],
      ["Invalid syntax", 3, "}"],
    ]);
    expect(structOf(midValue, "theme", "t")).toMatchObject({
      font: "Arial 1--display",
      dash: "Arial - 1--display",
      eq: "Arial x=1--display",
    });
    // A value is read from its first character, as the value readers trim it
    // before looking for a comment, so a `--` or `//` that starts it is text
    // however the `=` is spaced.
    const atStart = `theme t with
  a = --gap }
  b=--gap }
  c = //x }
end
`;
    expect(errorsOf(atStart).map((d) => [d.message, d.line, d.text])).toEqual([
      ["Invalid syntax", 1, "}"],
      ["Invalid syntax", 2, "}"],
      ["Invalid syntax", 3, "}"],
    ]);
    expect(structOf(atStart, "theme", "t")).toMatchObject({
      a: "--gap",
      b: "--gap",
      c: "//x",
    });
    // An apostrophe is not a quote, and an attribute selector in a value is
    // read whole, so neither hides the `}`.
    const quotes = `theme t with
  content = don't }
  pick = a[x='}'] }
end
`;
    expect(errorsOf(quotes).map((d) => [d.message, d.line, d.character])).toEqual([
      ["Invalid syntax", 1, 18],
      ["Invalid syntax", 2, 18],
    ]);
    expect(structOf(quotes, "theme", "t")).toMatchObject({
      content: "don't",
      pick: "a[x='}']",
    });
  });

  test("a stray `}` is invalid syntax", () => {
    const text = `animation a with
  timing { duration = 1 }
  }
end
`;
    const errors = errorsOf(text);
    expect(errors).toMatchObject([
      { message: "Invalid syntax", line: 2, text: "}" },
    ]);
    expect(structOf(text, "animation", "a").timing).toEqual({ duration: 1 });
  });
});

describe("indentation inside a block", () => {
  const BODY = `morph m with
  method = match
  keyframes {
    from {
      eyes {
        state = open
      }
    }
    to { eyes { state = closed } }
  }
  clips {
    {
      between { a }
      targets {
        b
        c
      }
    }
  }
end
`;

  test("changing any line's indentation, or removing it, leaves the struct unchanged", () => {
    const expected = structOf(BODY, "morph", "m");
    expect(expected.clips).toEqual([{ between: ["a"], targets: ["b", "c"] }]);
    const lines = BODY.split("\n");
    // Every line after a block's `{` up to its `}`.
    const isInside = (index: number) =>
      index >= 3 && index <= 18 && index !== 10;
    const inside = lines
      .map((line, index) => ({ line, index }))
      .filter(({ index }) => isInside(index));
    for (const { line, index } of inside) {
      for (const indent of ["", " ", "\t", "          "]) {
        const changed = [...lines];
        changed[index] = indent + line.trimStart();
        const source = changed.join("\n");
        expect(structOf(source, "morph", "m"), source).toEqual(expected);
      }
    }
    const flat = lines
      .map((line, index) => (isInside(index) ? line.trimStart() : line))
      .join("\n");
    expect(structOf(flat, "morph", "m")).toEqual(expected);
    expect(diagnosticsOf(flat).filter((d) => d.severity === 1)).toEqual([]);
  });

  test("an invalid colon mark before a block's `{` is invalid syntax, not a key", () => {
    const text = `theme t with
  values { - { a = 1 } }
  colors { accents: { value = red } }
end
`;
    expect(errorsOf(text)).toMatchObject([
      { message: "Invalid syntax", line: 1, text: "-" },
      { message: "Invalid syntax", line: 2, text: ":" },
    ]);
    const struct = structOf(text, "theme", "t");
    expect(struct.values).toEqual([{ a: 1 }]);
    expect(Object.keys(struct.colors)).not.toContain("accents:");
  });

  test("a brace inside a comment leaves an indented line in the multiline form", () => {
    const text = `theme t with
  values {
    2 -- } note
    red
  }
  other = 1 // see {a}
  more = 3 -- { b }
end
`;
    expect(errorsOf(text)).toEqual([]);
    expect(structOf(text, "theme", "t")).toMatchObject({
      values: [2, "red"],
      other: 1,
      more: 3,
    });
  });

  test("a brace in a comment right after a literal leaves an indented line in the multiline form", () => {
    const text = `theme t with
  values {
    2-- } note
    3
  }
  flags {
    true// } note
    false
  }
  names {
    "a"-- { note
  }
  group {
    k = 4-- } note
    j = false// { note
    pick = a[x='}']
    label = &[data-label="}"]
  }
end
`;
    expect(errorsOf(text)).toEqual([]);
    const struct = structOf(text, "theme", "t");
    expect(struct).toMatchObject({
      values: [2, 3],
      names: ["a"],
      group: { k: 4, j: false, pick: "a[x='}']", label: '&[data-label="}"]' },
    });
    // Two items. The indented form's own reading of `true//` (a `//` with no
    // whitespace after a literal) is the pre-existing truncation described in
    // "a `--` right after a number, boolean or quoted value begins a comment",
    // so its value is not pinned here.
    expect(struct.flags).toHaveLength(2);
  });

  test("an invalid colon `key:` header or `-` item inside a block is invalid syntax", () => {
    const text = `theme t with
  colors {
    accents:
      - red
  }
end
`;
    const errors = errorsOf(text);
    expect(errors).toMatchObject([
      { message: "Invalid syntax", line: 2, text: ":" },
      { message: "Invalid syntax", line: 3, text: "-" },
    ]);
    // A header with quoted runs or an attribute selector is one too, with or
    // without a `{` after its colon.
    const quoted = `style t with
  outer {
    &[data-label="x"]:
      color = red
    &[data-label='a;b']:
      color = blue
    &[data-label='a{b']: { color = green }
  }
end
`;
    expect(errorsOf(quoted).map((d) => [d.message, d.line, d.text])).toEqual([
      ["Invalid syntax", 2, ":"],
      ["Invalid syntax", 4, ":"],
      ["Invalid syntax", 6, ":"],
    ]);
    // A trailing comma after the colon does not hide it.
    const comma = `theme t with
  outer {
    accents:,
      v = 1
    &[data-label='a;b']:,
      w = 2
  }
end
`;
    expect(errorsOf(comma).map((d) => [d.message, d.line, d.text])).toEqual([
      ["Invalid syntax", 2, ":"],
      ["Invalid syntax", 4, ":"],
    ]);
    expect(structOf(comma, "theme", "t").outer).toEqual({ v: 1, w: 2 });
  });
});
