import { describe, expect, test } from "vitest";
import {
  type Cell,
  renderedBeat,
  renderedBeats,
  renderedChoiceBeats,
  script,
  show,
  VALUES,
} from "./harness/displayStyleHarness";
import {
  CHOICE_CORPUS,
  CORPUS,
  PAIRING_LINES,
  SUPPRESSION_CLOSE,
  SUPPRESSION_OPEN,
  cellsBetween,
  grammarCells,
  grammarReading,
} from "./harness/displayStylingCorpus";
import { treeScopeStackAt } from "@impower/sparkdown/src/tests/compiler/scopeEquality";

const withoutCentering = (cells: Cell[]): Cell[] =>
  cells.map(({ char, style }) => ({
    char,
    style: style
      .split(" ")
      .filter((s) => s && s !== "centered")
      .join(" "),
  }));

describe("the player renders display lines styled as the grammar reads them", () => {
  test.each(CORPUS.map((c) => [c.label, c] as const))("%s", async (_label, c) => {
    const source = script(c.body);
    const cellsOf = await renderedBeat(source);
    const bodyAt = source.indexOf(c.body);
    for (const part of c.parts ?? []) {
      const expectedTree: Cell[] = [];
      const expectedVscode: Cell[] = [];
      let searchFrom = bodyAt;
      for (const text of part.sources) {
        const from = source.indexOf(text, searchFrom);
        expect(from).toBeGreaterThanOrEqual(0);
        const { tree, vscode } = await grammarCells(source, from, from + text.length);
        expectedTree.push(...tree);
        expectedVscode.push(...vscode);
        searchFrom = from + text.length;
      }
      expect(show(expectedVscode)).toBe(show(expectedTree));
      let rendered = cellsOf(part.target).filter(({ char }) => char !== "\n");
      let expected = expectedTree;
      if (part.aligned) {
        rendered = withoutCentering(rendered);
        expected = withoutCentering(expected);
      }
      expect(show(rendered)).toBe(show(expected));
    }
  });
});

const PAIRING_CHUNK = 40;
const PAIRING_CHUNKS = Array.from({ length: Math.ceil(PAIRING_LINES.length / PAIRING_CHUNK) }, (_, i) =>
  PAIRING_LINES.slice(i * PAIRING_CHUNK, (i + 1) * PAIRING_CHUNK),
);

describe("the player renders the mark pairing corpus as the grammar reads it", () => {
  test.each(PAIRING_CHUNKS.map((chunk, i) => [`lines ${i * PAIRING_CHUNK + 1} to ${i * PAIRING_CHUNK + chunk.length}`, chunk] as const))(
    "%s",
    async (_name, chunk) => {
      const source = script(chunk.join("\n\n  "));
      const beats = await renderedBeats(source, chunk.length);
      const reading = await grammarReading(source);
      const mismatches: { line: string; tree: string; vscode: string; player: string }[] = [];
      let searchFrom = source.indexOf("scene start");
      for (let i = 0; i < chunk.length; i++) {
        await new Promise((resolve) => setImmediate(resolve));
        const line = chunk[i]!;
        const from = source.indexOf(line, searchFrom);
        searchFrom = from + line.length;
        const { tree, vscode } = cellsBetween(reading, source, from, from + line.length);
        const player = show(beats[i]!("action").filter(({ char }) => char !== "\n"));
        if (show(tree) !== player || show(vscode) !== player) {
          mismatches.push({ line, tree: show(tree), vscode: show(vscode), player });
        }
      }
      expect(mismatches).toEqual([]);
    },
    120000,
  );
});

describe("the player renders marks paired by CommonMark's rules", () => {
  test("an unclosed mark renders as literal text", async () => {
    const cellsOf = await renderedBeat(script("Go *far away"));
    expect(show(cellsOf("action"))).toBe("Go *far away");
  });

  test("strong emphasis inside strong emphasis renders bold", async () => {
    const cellsOf = await renderedBeat(script("A ****x**** y"));
    expect(show(cellsOf("action"))).toBe("A [bold: x] y");
  });

  test("the first span to close wins and the marks it leaves render as text", async () => {
    const cellsOf = await renderedBeat(script("A *a _b* c_ d"));
    expect(show(cellsOf("action"))).toBe("A [italic: a _b] c_ d");
  });

  test("an underscore inside a word renders unstyled", async () => {
    const cellsOf = await renderedBeat(script("snake_case_name"));
    expect(show(cellsOf("action"))).toBe("snake_case_name");
  });
});

describe("the player reads choice text as a display line reads the same text", () => {
  test("marks the grammar leaves literal stay literal in the menu", async () => {
    const LINE = "Choice snake_case_name *open `raw {1+1}";
    const body = `${LINE}\n\n  choose\n    + ${LINE}\n      Done.\n  end`;
    const [display, choice] = await renderedBeats(script(body), 2);
    const line = (cells: Cell[]) => show(cells.filter(({ char }) => char !== "\n"));
    expect(line(choice!("choice 0"))).toBe(line(display!("action")));
    expect(line(choice!("choice 0"))).toBe("Choice snake_case_name *open `raw 2");
  });
});


interface ChoiceReading {
  menu: Cell[];
  echo: Cell[];
}

async function choiceGrammarReading(source: string, text: string): Promise<{ tree: ChoiceReading; vscode: ChoiceReading }> {
  const from = source.indexOf(`+ ${text}`) + 2;
  const to = from + text.length;
  const reading = await grammarReading(source);
  let open = -1;
  let close = -1;
  for (let i = from; i < to; i++) {
    const scopes = treeScopeStackAt(reading.tree, i);
    if (open < 0 && scopes.includes(SUPPRESSION_OPEN)) open = i;
    else if (open >= 0 && close < 0 && scopes.includes(SUPPRESSION_CLOSE)) close = i;
  }
  const between = (a: number, b: number) => cellsBetween(reading, source, a, b);
  const join = (parts: { tree: Cell[]; vscode: Cell[] }[]) => ({
    tree: parts.flatMap((p) => p.tree),
    vscode: parts.flatMap((p) => p.vscode),
  });
  const menu =
    open < 0 ? between(from, to) : close < 0 ? join([between(from, open), between(open + 1, to)]) : join([between(from, open), between(open + 1, close)]);
  const echo =
    open < 0 ? between(from, to) : close < 0 ? between(from, open) : join([between(from, open), between(close + 1, to)]);
  return {
    tree: { menu: menu.tree, echo: echo.tree },
    vscode: { menu: menu.vscode, echo: echo.vscode },
  };
}

async function renderedChoice(source: string): Promise<ChoiceReading> {
  const { menu, echo } = await renderedChoiceBeats(source);
  return { menu: menu("choice 0"), echo: echo("action") };
}

const visible = (cells: Cell[]): string => show(cells.filter(({ char }) => !/\s/.test(char)));

describe("the player renders choice lines styled as the grammar reads them", () => {
  test.each(CHOICE_CORPUS)("%s", async (text) => {
    const source = script(`choose\n    + ${text}\n      Done.\n  end`);
    const grammar = await choiceGrammarReading(source, text);
    expect(show(grammar.vscode.menu)).toBe(show(grammar.tree.menu));
    expect(show(grammar.vscode.echo)).toBe(show(grammar.tree.echo));
    const rendered = await renderedChoice(source);
    expect({ menu: visible(rendered.menu), echo: visible(rendered.echo) }).toEqual({
      menu: visible(grammar.tree.menu),
      echo: visible(grammar.tree.echo),
    });
  });
});

describe("marks never cross a choice bracket", () => {
  const rendered = async (text: string) => {
    const reading = await renderedChoice(script(`choose\n    + ${text}\n      Done.\n  end`));
    const line = (cells: Cell[]) => show(cells.filter(({ char }) => char !== "\n"));
    return { menu: line(reading.menu), echo: line(reading.echo) };
  };

  test("marks in the start text and the inner text stay text in both renditions", async () => {
    expect(await rendered("Cross *far [away] now* x")).toEqual({
      menu: "Cross *far away",
      echo: "Cross *far now* x",
    });
  });

  test("marks in the start text and the suppressed text stay text in both renditions", async () => {
    expect(await rendered("Go *far [away* now] x")).toEqual({
      menu: "Go *far away* now",
      echo: "Go *far x",
    });
  });

  test("marks in the suppressed text and the inner text stay text in both renditions", async () => {
    expect(await rendered("Go [far *away] now* x")).toEqual({
      menu: "Go far *away",
      echo: "Go now* x",
    });
  });

  test("a span closed inside one part is styled beside a stray mark in another", async () => {
    expect(await rendered("Go *a* [b *c] d")).toEqual({
      menu: "Go [italic: a] b *c",
      echo: "Go [italic: a] d",
    });
  });
});

describe("the output joins the text on either side of a suppression with one space", () => {
  test.each([
    ["Go a [b] c", "Go a c"],
    ["Go [a] b", "Go b"],
    ["Cross *far [away] now* x", "Cross *far now* x"],
    ["Go *a* [b] *c* d", "Go a c d"],
    ["Go a [b] c #tag", "Go a c #tag"],
    ["Go a[b] c", "Go a c"],
  ])("%s", async (text, output) => {
    const { echo } = await renderedChoiceBeats(script(`choose\n    + ${text}\n      Done.\n  end`));
    expect(
      echo("action")
        .map(({ char }) => char)
        .join(""),
    ).toBe(output);
  });

  test.each([
    ["Go a [b]` c ` d", "Go a ` c ` d"],
    ["Go `x `[b] c", "Go `x ` c"],
    ["Go `x ` [b] c", "Go `x ` c"],
    ["Go {x} [b] c", "Go {x} c"],
  ])("%s keeps the spaces inside a raw span or a value, as the display line %s does", async (text, display) => {
    const { echo } = await renderedChoiceBeats(script(`choose\n    + ${text}\n      Done.\n  end`));
    const line = await renderedBeat(script(display));
    expect(show(echo("action"))).toBe(show(line("action")));
  });
});

describe("a mark inside an inserted value is styled within the value only", () => {
  test("a value's star does not close the script's italic span", async () => {
    const cellsOf = await renderedBeat(
      script("*far {x} away* now", `store x = "a* b"\n`),
    );
    expect(show(cellsOf("action"))).toBe("[italic: far a b away] now");
  });

  test("a value's own marks style the value", async () => {
    const cellsOf = await renderedBeat(
      script("Value {y} here", `store y = "*b*"\n`),
    );
    expect(show(cellsOf("action"))).toBe("Value [italic: b] here");
  });

  test("a value holding a style code's character cannot close or open a span", async () => {
    const closing = await renderedBeat(
      script("C *span {pua} still* D", `store pua = "x\\u{E002}y"\n`),
    );
    expect(show(closing("action"))).toBe("C [italic: span xy still] D");
    const opening = await renderedBeat(
      script("E {opener} F", `store opener = "\\u{E010}\\u{E021}z"\n`),
    );
    expect(show(opening("action"))).toBe("E z F");
  });

  test("an alternator's chosen value inside braces is styled within the value", async () => {
    const cellsOf = await renderedBeat(
      script(`A {queue | "*one*" | "two" end} end`),
    );
    expect(show(cellsOf("action"))).toBe("A [italic: one] end");
  });

  test("an escape at the end of one value does not reach into the next", async () => {
    const cellsOf = await renderedBeat(
      script("A {x}{y} end", `store x = "back\\\\"\nstore y = "*b*"\n`),
    );
    expect(show(cellsOf("action"))).toBe("A back[italic: b] end");
  });

  test("a table a script builds and hands to display() is read as a value", async () => {
    const cellsOf = await renderedBeat(
      script(`& display({ target = "action", text = "*word* here" })`),
    );
    expect(show(cellsOf("action"))).toBe("[italic: word] here");
  });

  test("a cue whose marks spell a declared character's name finds that character", async () => {
    const cellsOf = await renderedBeat(
      script(
        "*NOVA*: Hey",
        `${VALUES}define nova as character with\n  name = "*NOVA*"\nend\n`,
      ),
    );
    expect(cellsOf.beat.speaker?.character).toBe("nova");
    expect(show(cellsOf("character_name"))).toBe("[italic: NOVA]");
  });

  test("a value's animation adds to the script's animation around it", async () => {
    const cellsOf = await renderedBeat(
      script("A ~~a {v} c~~ D", `store v = "::b::"\n`),
    );
    expect(show(cellsOf("action"))).toBe("A [wavy: a ][shaky wavy: b][wavy:  c] D");
  });

  test("a value's unclosed mark ends with the value", async () => {
    const cellsOf = await renderedBeat(
      script("Value {y} here", `store y = "*b"\n`),
    );
    expect(show(cellsOf("action"))).toBe("Value [italic: b] here");
  });
});
