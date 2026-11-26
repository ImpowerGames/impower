import { describe, expect, test } from "vitest";
import { compileScript } from "../program/programHarness";

interface Found {
  severity: number | undefined;
  line: number;
  word: string;
  message: string;
}

const NO_END = "Scene is missing its closing";

function compiled(text: string) {
  const { program } = compileScript(text);
  const lines = text.split("\n");
  const found: Found[] = Object.values(program.diagnostics ?? {})
    .flat()
    .map((d) => {
      const { start, end } = d.range;
      return {
        severity: d.severity,
        line: start.line,
        word: start.line === end.line ? lines[start.line]!.slice(start.character, end.character) : "",
        message: typeof d.message === "string" ? d.message : d.message.value,
      };
    })
    .filter((d) => !/^Cannot find (?:image|audio|channel|layered_audio)/.test(d.message) && !d.message.startsWith(NO_END));
  return { program, found };
}

const scene = (...lines: string[]) => ["scene start", ...lines.map((line) => `  ${line}`), "  Hello.", "end", ""].join("\n");

const SOFA = `framing sofa {
  x = 60%
  y = 100%
  zoom = 1.2
}

framing half {
  x = 25%
}
`;

describe("the framing keyword (I-2479)", () => {
  test("a framing compiles into the program with its fields as written", () => {
    const { program, found } = compiled(SOFA + scene("[[show backdrop bg at sofa]]"));
    expect(program.context?.["framing"]?.["sofa"]).toMatchObject({ $type: "framing", $name: "sofa", x: "60%", y: "100%", zoom: 1.2 });
    expect(found).toEqual([]);
  });

  test("a framing carries the defaults for the fields it leaves out", () => {
    const { program } = compiled(SOFA + scene());
    expect(program.context?.["framing"]?.["half"]).toMatchObject({ x: "25%", y: "50%", zoom: 1 });
  });

  test("the nine built-in framings are in the program", () => {
    const framings = compiled(scene()).program.context?.["framing"] ?? {};
    expect(Object.fromEntries(Object.entries(framings).filter(([name]) => name !== "$default").map(([name, f]) => [name, [f.x, f.y, f.zoom]]))).toEqual({
      left: ["0%", "50%", 1],
      center: ["50%", "50%", 1],
      right: ["100%", "50%", 1],
      top: ["50%", "0%", 1],
      bottom: ["50%", "100%", 1],
      top_left: ["0%", "0%", 1],
      top_right: ["100%", "0%", 1],
      bottom_left: ["0%", "100%", 1],
      bottom_right: ["100%", "100%", 1],
    });
  });

  test("an author's framing with a built-in's name merges over the built-in, as a redeclared built-in animation does", () => {
    const { program, found } = compiled(`animation shake {
  target = layer.self
}

framing top_left {
  x = 10%
}
` + scene());
    const shake = program.context?.["animation"]?.["shake"];
    expect(shake.target).toMatchObject({ $name: "self" });
    expect(shake.keyframes.length).toBeGreaterThan(0);
    expect(program.context?.["framing"]?.["top_left"]).toMatchObject({ x: "10%", y: "0%", zoom: 1 });
    expect(found).toEqual([]);
  });

  test("an x or y outside 0% to 100% and a zoom below 1 compile without a diagnostic", () => {
    const { program, found } = compiled(`framing wide {
  x = -20%
  y = 140%
  zoom = 0.5
}
` + scene());
    expect(program.context?.["framing"]?.["wide"]).toMatchObject({ x: "-20%", y: "140%", zoom: 0.5 });
    expect(found).toEqual([]);
  });

  test("a field other than x, y and zoom, a value of the wrong kind and a zoom of zero or less are diagnostics at their words", () => {
    const { found } = compiled(`framing bad {
  w = 1
  x = 5
  y = left
  zoom = 0
}

framing worse {
  zoom = -1
}
` + scene());
    expect(found.map(({ severity, line, word, message }) => [severity, line, word, message.split("\n")[0]])).toEqual([
      [1, 1, "w", "`w` is not a framing field. A framing sets `x`, `y` and `zoom`."],
      [1, 2, "5", "`x` should be a percentage, where `0%` sets the picture's left edge on the layer's and `100%` its right edge"],
      [1, 3, "left", "`y` should be a percentage, where `0%` sets the picture's top edge on the layer's and `100%` its bottom edge"],
      [1, 4, "0", "`zoom` should be a number above zero, where `1` is the picture's size on its layer"],
      [1, 8, "-1", "`zoom` should be a number above zero, where `1` is the picture's size on its layer"],
    ]);
  });
});

describe("the at and to clauses (I-2479)", () => {
  const diagnosticsOf = (...lines: string[]) =>
    compiled(SOFA + scene(...lines)).found.map(({ severity, line, word, message }) => [severity, line - 9, word, message.split("\n")[0]]);

  test("at on show and the bare shorthand, and to on animate, compile with no diagnostic", () => {
    expect(
      diagnosticsOf("[[show backdrop bg at right]]", "[[bunny@serious at left]]", "[[animate backdrop to sofa over 1s]]", "[[animate backdrop to left over 1s with shake]]"),
    ).toEqual([]);
  });

  test("a name after at or to that is not a framing is reported as an unknown name after with is", () => {
    const withMessage = diagnosticsOf("[[show backdrop bg with nowhere]]")[0]!;
    expect(withMessage).toEqual([2, 1, "nowhere", "Cannot find transition or animation named `nowhere`"]);
    expect(diagnosticsOf("[[show backdrop bg at nowhere]]", "[[animate backdrop to elsewhere]]")).toEqual([
      [2, 1, "nowhere", "Cannot find framing named `nowhere`"],
      [2, 2, "elsewhere", "Cannot find framing named `elsewhere`"],
    ]);
  });

  test("a value after at or to that is not a name is a diagnostic at the value", () => {
    expect(diagnosticsOf("[[show backdrop bg at 5]]", "[[animate backdrop to 0.5]]")).toEqual([
      [1, 1, "5", "`at` should be followed by the name of a framing"],
      [1, 2, "0.5", "`to` should be followed by the name of a framing"],
    ]);
  });

  test("at on animate or hide is a diagnostic at the at", () => {
    expect(diagnosticsOf("[[animate backdrop at left]]", "[[hide backdrop at left]]")).toEqual([
      [2, 1, "at", "`at` places a picture as it is shown, so it belongs on `show` or a bare picture line, not on `animate`"],
      [2, 2, "at", "`at` places a picture as it is shown, so it belongs on `show` or a bare picture line, not on `hide`"],
    ]);
  });

  test("to on show, hide or the bare shorthand is a diagnostic at the to", () => {
    expect(diagnosticsOf("[[show backdrop bg to left]]", "[[hide backdrop to left]]", "[[bunny to left]]")).toEqual([
      [2, 1, "to", "`to` moves a layer's picture, so it belongs on `animate`, not on `show`"],
      [2, 2, "to", "`to` moves a layer's picture, so it belongs on `animate`, not on `hide`"],
      [2, 3, "to", "`to` moves a layer's picture, so it belongs on `animate`, not on a bare picture line"],
    ]);
  });

  test("at on a show that names no picture is a diagnostic at the at", () => {
    expect(diagnosticsOf("[[show backdrop at left]]", "[[at left]]")).toEqual([
      [2, 1, "at", "`at` places the picture this line shows, and this line names no picture"],
      [2, 2, "at", "`at` places the picture this line shows, and this line names no picture"],
    ]);
  });

  test("a picture name on an animate … to line is a diagnostic at the name", () => {
    expect(diagnosticsOf("[[animate backdrop bg to left over 1s]]", "[[animate backdrop bg + bg2 to left]]")).toEqual([
      [2, 1, "bg", "`to` moves the picture the layer already shows, so an `animate … to` line names no picture"],
      [2, 2, "bg + bg2", "`to` moves the picture the layer already shows, so an `animate … to` line names no picture"],
    ]);
  });

  test("at outside a picture line is a diagnostic, and to keeps its audio volume meaning", () => {
    expect(diagnosticsOf("((play music theme at left))", "((fade music theme to 0.5 over 1s))", "((fade music theme to loud))")).toEqual([
      [2, 1, "at", "`at` places a picture as it is shown, so it belongs on `show` or a bare picture line"],
      [1, 3, "loud", "`to` should be followed by a number greater than 0"],
    ]);
  });
});
