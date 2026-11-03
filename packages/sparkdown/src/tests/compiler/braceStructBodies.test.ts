import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { compileSource } from "./compileSnapshot";

type StructType = "style" | "animation" | "theme" | "morph";

function structOf(source: string, type: StructType, name: string): any {
  const entry = compileSource(source).find(
    (e) => e.block?.context?.[type]?.[name],
  );
  return entry?.block?.context?.[type]?.[name];
}

const URI = "file:///main.sd";

const NO_START = "no scene named start; the story starts in a scene named start";

interface Found {
  message: string;
  severity: number | undefined;
  line: number;
  character: number;
  text: string;
}

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
  return (program.diagnostics?.[URI] ?? []).filter((d) => (typeof d.message === "string" ? d.message : d.message.value) !== NO_START).map((d) => {
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

const STYLE_INDENTED = `style button {
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
}
`;

const STYLE_BRACED = `style button {
  cursor = pointer
  &.secondary { background-color = slate_50 }
  > text.label { text-weight = 600 }
  @hovered, @pressed { background-color = sky_50 }
  @screen-size(sm) {
    width = 100%
    > text { font-size = 12px }
  }
}
`;

const LIST_INDENTED = `animation pulse {
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
}
`;

const LIST_BRACED = `animation pulse {
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
}
`;

const POSITIONS_INDENTED = `animation fade {
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
}
`;

const POSITIONS_BRACED = `animation fade {
  keyframes {
    from { opacity = 0 }
    40% { opacity = 0.5 }
    to { opacity = 1 }
  }
  timing = {
    duration = 0.4,
    easing = ease-in-out,
  }
}
`;

const THEME_INDENTED = `theme dusk {
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
}
`;

const THEME_BRACED = `theme dusk {
  colors {
    primary = red
    surface = "#101010"
  }
  spacing { sm = 4; md = 8 }
  fonts { "Courier Prime"; serif }
}
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
    const braced = `style t {
  &.card--large { opacity = 0.5 }
  &.primary--active {
    opacity = 1
  }
}
`;
    const indented = `style t {
  &.card--large {
    opacity = 0.5
  }
  &.primary--active {
    opacity = 1
  }
}
`;
    const struct = structOf(braced, "style", "t");
    expect(struct["&.card--large"]).toEqual({ opacity: "0.5" });
    expect(struct).toEqual(structOf(indented, "style", "t"));
    expect(errorsOf(braced)).toEqual([]);
    const attribute = `style t {
  &[data-label=true--suffix] { color = red }
}
`;
    expect(structOf(attribute, "style", "t")).toEqual(
      structOf(
        `style t {
  &[data-label=true--suffix] {
    color = red
  }
}
`,
        "style",
        "t",
      ),
    );
    expect(structOf(attribute, "style", "t")["&[data-label=true--suffix]"]).toEqual({
      color: "red",
    });
    const quoted = `style t {
  &[data-label="x"] { color = red }
  &[data-label="true--suffix"] { color = green }
  &[data-label="a b;{"] { color = blue }
}
`;
    const quotedIndented = `style t {
  &[data-label="x"] {
    color = red
  }
  &[data-label="true--suffix"] {
    color = green
  }
  &[data-label="a b;{"] {
    color = blue
  }
}
`;
    expect(structOf(quoted, "style", "t")).toEqual(
      structOf(quotedIndented, "style", "t"),
    );
    expect(structOf(quoted, "style", "t")['&[data-label="x"]']).toEqual({
      color: "red",
    });
    expect(errorsOf(quoted)).toEqual([]);
    const single = `style t {
  &[data-label='a;b'] { opacity = 0.5 }
  &[data-label='space ; { --'], &[data-kind="x"] = { opacity = 0.25 }
  > text { text-color = white; text-size = 24px }
}
`;
    const singleIndented = `style t {
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
}
`;
    expect(structOf(single, "style", "t")).toEqual(
      structOf(singleIndented, "style", "t"),
    );
    expect(Object.keys(structOf(single, "style", "t"))).toEqual(
      expect.arrayContaining(["&[data-label='a;b']", "> text"]),
    );
    expect(errorsOf(single)).toEqual([]);
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
    const braced = `animation a {
  target = layer.self; timing {
    duration = 1
  }
}
`;
    const indented = `animation a {
  target = layer.self
  timing {
    duration = 1
  }
}
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
      expect(structOf(braced, type, name), braced).toEqual(
        structOf(indented, type, name),
      );
      expect(messages(braced), braced).toEqual(messages(indented));
      expect(errorsOf(braced), braced).toEqual([]);
    }
  });
});

describe("block spellings", () => {
  test.each(["theme", "style"] as const)("%s bare list values preserve embedded colons", (type) => {
    const source = `${type} t with
links {
https://example.com
12:30
asset:icon
}
end
`;
    expect(errorsOf(source)).toEqual([]);
    expect(structOf(source, type, "t").links).toEqual([
      "https://example.com", "12:30", "asset:icon",
    ]);
  });

  test("`header = { … }` lowers like `header { … }`", () => {
    const withEquals = structOf(
      `animation a {
  timing = { duration = 1; delay = 2 }
  keyframes = {
    from = { opacity = 0 }
    to = { opacity = 1 }
  }
}
`,
      "animation",
      "a",
    );
    const without = structOf(
      `animation a {
  timing { duration = 1; delay = 2 }
  keyframes {
    from { opacity = 0 }
    to { opacity = 1 }
  }
}
`,
      "animation",
      "a",
    );
    expect(withEquals).toEqual(without);
    expect(withEquals.timing).toEqual({ duration: 1, delay: 2 });
    const style = (text: string) => structOf(text, "style", "s");
    expect(style("style s {\n  &.a = { color = red }\n}\n")).toEqual(
      style("style s {\n  &.a { color = red }\n}\n"),
    );
  });

  test("a one-line block and a nested one-line block lower like their multi-line forms", () => {
    const oneLine = structOf(
      `morph m {
  keyframes { { offset = 0; eyes { state = open; translate = 0 8px } }; { offset = 1; eyes { state = closed } } }
  timing { duration = 1; delay = 0.5 }
}
`,
      "morph",
      "m",
    );
    const multiLine = structOf(
      `morph m {
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
}
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
    const braced = `style s {
  &.a { color = red; content = "a { b } ; c"; width = 10px }
}
`;
    const style = structOf(braced, "style", "s");
    expect(style["&.a"]).toEqual({
      color: "red",
      content: "a { b } ; c",
      width: "10px",
    });
    const indented = `style s {
  &.a {
    color = red
    content = "a { b } ; c"
    width = 10px
  }
}
`;
    expect(structOf(indented, "style", "s")).toEqual(style);
    const messages = (text: string) =>
      diagnosticsOf(text).map((d) => `${d.severity} ${d.message}`);
    expect(messages(braced)).toEqual(messages(indented));
    const animation = structOf(
      `animation a {
  timing { easing = "steps(2; x)"; duration = 3 }
}
`,
      "animation",
      "a",
    );
    expect(animation.timing).toEqual({ easing: "steps(2; x)", duration: 3 });
  });

  test("a `--` comment inside a block is not part of any value", () => {
    const animation = structOf(
      `animation a {
  timing {
    -- how long it plays
    duration = 3 -- seconds
    delay = 1; -- then this
  }
}
`,
      "animation",
      "a",
    );
    expect(animation.timing).toEqual({ duration: 3, delay: 1 });
  });

  test("a `--` right after a number, boolean or quoted value begins a comment, as in the multiline form", () => {
    const braced = `theme t {
  a { x = 1-- } ; comment
    y = true-- }
    z = "q"-- }
    w = var(--gap)
  }
  list { 2-- } ; comment
  }
}
`;
    const indented = `theme t {
  a {
    x = 1-- } ; comment
    y = true-- }
    z = "q"-- }
    w = var(--gap)
  }
  list {
    2-- } ; comment
  }
}
`;
    const struct = structOf(braced, "theme", "t");
    expect(struct.a).toEqual({ x: 1, y: true, z: "q", w: "var(--gap)" });
    const slashBraced = `theme t {
  colors {
    value = 1 // } note
    // a whole-line note }
    next = 2
    list { red // } note
    }
  }
}
`;
    const slashIndented = `theme t {
  colors {
    value = 1 // } note
    next = 2
    list {
      red // } note
    }
  }
}
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
    const literalBraced = `theme t {
  colors {
    a = 1 //c }
    b = "q" //c }
    c = true //c }
  }
}
`;
    const literalMultiline = `theme t {
  colors {
    a = 1 //c }
    b = "q" //c }
    c = true //c }
  }
}
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
    const notLiteralBraced = `theme t {
  colors {
    c = +1--c
    d = +1//c
  }
}
`;
    const notLiteralIndented = `theme t {
  colors {
    c = +1--c
    d = +1//c
  }
}
`;
    expect(structOf(notLiteralBraced, "theme", "t")).toEqual(
      structOf(notLiteralIndented, "theme", "t"),
    );
    expect(structOf(notLiteralBraced, "theme", "t").colors).toEqual({
      c: "+1--c",
      d: "+1//c",
    });
    expect(errorsOf(notLiteralBraced)).toEqual([]);
    const adjacent = `theme t {
  colors { a = 1//c }
    b = true//c }
  }
}
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
    const text = `animation a {
  timing {
    duration = 1,
    delay = 2,
  }
  keyframes { from { opacity = 0, }; to { opacity = 1 }, }
}
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
    const text = `theme t {
  colors {
    value = 1, // trailing } {
    other = 2, -- trailing } {
    list { red, // } note
      blue, -- } note
    }
  }
}
`;
    expect(errorsOf(text)).toEqual([]);
    expect(structOf(text, "theme", "t").colors).toEqual({
      value: 1,
      other: 2,
      list: ["red", "blue"],
    });
  });

  test("a comma between two properties on one line separates them, as `;` does", () => {
    const text = `animation a {
  timing { duration = 1, delay = 2 }
}
`;
    expect(errorsOf(text)).toEqual([]);
    expect(structOf(text, "animation", "a").timing).toEqual({
      duration: 1,
      delay: 2,
    });
    for (const key of ['"b"', "$b", '["b"]', "2"]) {
      const keyed = (sep: string) => `theme t {
  g { a = 1${sep} ${key} = 2 }
}
`;
      expect(errorsOf(keyed(",")), key).toEqual([]);
      expect(structOf(keyed(","), "theme", "t"), key).toEqual(
        structOf(keyed(";"), "theme", "t"),
      );
    }
    const unicode = `theme t {
  g { a = 1, 名 = 2, tail = 3 }
}
`;
    expect(errorsOf(unicode)).toEqual([]);
    expect(structOf(unicode, "theme", "t").g).toMatchObject({ a: 1, tail: 3 });
  });

  test("a comma between two list values on one line separates them, as `;` does", () => {
    const text = `morph m {
  method = match
  keyframes {
    from { eyes { state = open } }
    to { eyes { state = closed } }
  }
  clips {
    { between { a }, targets { b, c } }
  }
}
`;
    expect(errorsOf(text)).toEqual([]);
    expect(structOf(text, "morph", "m").clips).toEqual([
      { between: ["a"], targets: ["b", "c"] },
    ]);
    for (const value of ['"a"', "a"]) {
      const beforeObject = `theme t {
  entries { ${value}, { v = 1 } }
}
`;
      expect(errorsOf(beforeObject), value).toEqual([]);
      expect(structOf(beforeObject, "theme", "t").entries, value).toEqual([
        "a",
        { v: 1 },
      ]);
    }
  });

  test("a comma between a property and a nested block separates them, and the block keeps its own header", () => {
    const style = `style banner {
  &.card { opacity = 0.5, > text { text-color = red } }
}
`;
    expect(errorsOf(style)).toEqual([]);
    expect(structOf(style, "style", "banner")["&.card"]).toEqual({
      opacity: "0.5",
      "> text": { "text-color": "red" },
    });

    const animation = `animation a {
  timing { duration = 1, nested { delay = 2 } }
}
`;
    expect(errorsOf(animation)).toEqual([]);
    expect(structOf(animation, "animation", "a").timing).toEqual({
      duration: 1,
      nested: { delay: 2 },
    });
  });

  test("one-line blocks with commas lower to the struct of their `;` forms in a morph body and a style body", () => {
    const morph = (sep: string) => `morph m {
  method = bend
  keyframes {
    from { eyes { state = open } }
    to { eyes { state = closed } }
  }
  clips { { between { eyelash-right${sep} eyelash-top-right }${sep} targets { a${sep} b } } }
  paints = { { targets { a }${sep} state = eyes.closed${sep} fill = red }${sep} { targets { b }${sep} state = eyes.closed${sep} fill = blue } }
}
`;
    expect(errorsOf(morph(","))).toEqual([]);
    expect(structOf(morph(","), "morph", "m")).toEqual(
      structOf(morph(";"), "morph", "m"),
    );
    expect(structOf(morph(","), "morph", "m").paints).toEqual([
      { targets: ["a"], state: "eyes.closed", fill: "red" },
      { targets: ["b"], state: "eyes.closed", fill: "blue" },
    ]);

    const style = (sep: string) => `style s {
  &.a { opacity = 1${sep} text-color = red${sep} > text { margin = 2${sep} padding = 3 } }
}
`;
    expect(errorsOf(style(","))).toEqual([]);
    expect(structOf(style(","), "style", "s")).toEqual(
      structOf(style(";"), "style", "s"),
    );
  });

  test("a comma inside a property's value stays part of the value", () => {
    const text = `style s {
  &.a {
    transition-property = background-color, opacity
    font-family = "Courier Prime", serif
  }
}
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

animation after {
  timing {
    duration = 2
  }
}
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

animation after {
  timing { duration = 2 }
}
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
  const BODY = `morph m {
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
}
`;

  test("changing any line's indentation, or removing it, leaves the struct unchanged", () => {
    const expected = structOf(BODY, "morph", "m");
    expect(expected.clips).toEqual([{ between: ["a"], targets: ["b", "c"] }]);
    const lines = BODY.split("\n");
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

  test("an invalid colon mark before a block's `{` is reported on the colon, not read as a key", () => {
    const text = `theme t {
  values { - { a = 1 } }
  colors { accents: { value = red } }
}
`;
    expect(errorsOf(text)).toMatchObject([
      { message: "Invalid syntax", line: 1, text: "-" },
      { message: "Expected '=' when parsing field, got ':'", line: 2, text: ":" },
    ]);
    const struct = structOf(text, "theme", "t");
    expect(struct.values).toEqual([{ a: 1 }]);
    expect(Object.keys(struct.colors)).not.toContain("accents:");
  });

  test("a brace inside a comment leaves an indented line in the multiline form", () => {
    const text = `theme t {
  values {
    2 -- } note
    red
  }
  other = 1 // see {a}
  more = 3 -- { b }
}
`;
    expect(errorsOf(text)).toEqual([]);
    expect(structOf(text, "theme", "t")).toMatchObject({
      values: [2, "red"],
      other: 1,
      more: 3,
    });
  });

  test("a brace in a comment right after a literal leaves an indented line in the multiline form", () => {
    const text = `theme t {
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
}
`;
    expect(errorsOf(text)).toEqual([]);
    const struct = structOf(text, "theme", "t");
    expect(struct).toMatchObject({
      values: [2, 3],
      names: ["a"],
      group: { k: 4, j: false, pick: "a[x='}']", label: '&[data-label="}"]' },
    });
    expect(struct.flags).toHaveLength(2);
  });

  test("an invalid colon `key:` header or `-` item inside a block is reported on its mark", () => {
    const text = `theme t {
  colors {
    accents:
      - red
  }
}
`;
    const errors = errorsOf(text);
    expect(errors).toMatchObject([
      { message: "Expected '=' when parsing field, got ':'", line: 2, text: ":" },
      { message: "Invalid syntax", line: 3, text: "-" },
    ]);
    const quoted = `style t {
  outer {
    &[data-label="x"]:
      color = red
    &[data-label='a;b']:
      color = blue
    &[data-label='a{b']: { color = green }
  }
}
`;
    expect(errorsOf(quoted).map((d) => [d.message, d.line, d.text])).toEqual([
      ["Expected '=' when parsing field, got ':'", 2, ":"],
      ["Expected '=' when parsing field, got ':'", 4, ":"],
      ["Expected '=' when parsing field, got ':'", 6, ":"],
    ]);
    const comma = `theme t {
  outer {
    accents:,
      v = 1
    &[data-label='a;b']:,
      w = 2
  }
}
`;
    expect(errorsOf(comma).map((d) => [d.message, d.line, d.text])).toEqual([
      ["Expected '=' when parsing field, got ':'", 2, ":"],
      ["Expected '=' when parsing field, got ':'", 4, ":"],
    ]);
    expect(structOf(comma, "theme", "t").outer).toEqual({ v: 1, w: 2 });
  });
});
