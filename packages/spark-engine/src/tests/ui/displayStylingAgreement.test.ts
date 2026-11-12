import { describe, expect, test } from "vitest";
import { parseSource } from "@impower/sparkdown/src/tests/compiler/grammarSnapshot";
import {
  treeScopeStackAt,
  vscodeScopeStacksPerChar,
} from "@impower/sparkdown/src/tests/compiler/scopeEquality";
import type { Instructions } from "../../game/core/types/Instructions";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const SCREEN = `layout main {
  action {
    text
  }
  dialogue {
    character_info {
      character_name {
        text
      }
      character_parenthetical {
        text
      }
    }
    text
  }
}
`;

const VALUES = `store x = "plain"\n`;

interface Part {
  target: string;
  sources: string[];
  aligned?: boolean;
}

interface Case {
  label: string;
  body: string;
  parts?: Part[];
}

const action = (body: string): Case => ({
  label: body,
  body,
  parts: [{ target: "action", sources: [body] }],
});

const CORPUS: Case[] = [
  action("The room is quiet."),
  action("A *word* here."),
  action("A **word** here."),
  action("A ***word*** here."),
  action("A _word_ here."),
  action("A __word__ here."),
  action("A ^word^ here."),
  action("A ~~wavy~~ word."),
  action("A ~~~slow~~~ word."),
  action("A ::shaky:: word."),
  action("Nested *_both_* end."),
  action("A **a *b* c** d"),
  action("A *a **b** c* d"),
  action("A ~~a **b** c~~ d"),
  action("A __a_ b__ c"),
  action("A ^^a^ b^^ c"),
  action("A ***a* b** c"),
  action("A ***a** b* c"),
  action("A **a*b** c"),
  action("A x*y*z here"),
  action("A 2^3^4 here"),
  action("A *rest of line"),
  action("A **rest of line"),
  action("A _rest of line"),
  action("A ~~rest of line"),
  action("*far {x} away* now"),
  action("A **{x}** b"),
  action("A *a {x}"),
  action("A ***bi {x} c*** d"),
  action("A ***a* {x}** end"),
  action("Esc \\*literal\\* end."),
  action("A *b\\* c* d"),
  action("A \\\\*b* c"),
  action("A `raw *x*` b"),
  action("A *`b`* c"),
  action("A `b"),
  action("A *b `c* d` e"),
  action("**bold /* c */ more** end"),
  action("*a /* c */ b* c"),
  {
    label: "a dialogue line with a span around an interpolation",
    body: "NOVA: Hi *there {x}* now",
    parts: [
      { target: "character_name", sources: ["NOVA"] },
      { target: "dialogue", sources: ["Hi *there {x}* now"] },
    ],
  },
  {
    label: "a styled character name",
    body: "*NOVA*: Hey",
    parts: [
      { target: "character_name", sources: ["*NOVA*"] },
      { target: "dialogue", sources: ["Hey"] },
    ],
  },
  {
    label: "a styled cue parenthetical",
    body: "NOVA (*sad*): Hey",
    parts: [
      { target: "character_name", sources: ["NOVA"] },
      { target: "character_parenthetical", sources: ["(*sad*)"], aligned: true },
      { target: "dialogue", sources: ["Hey"] },
    ],
  },
  {
    label: "a block dialogue with a styled parenthetical and an unclosed span on each line",
    body: "NOVA:\n    (*softly*)\n    Line *one\n    Line two* x",
    parts: [
      { target: "character_name", sources: ["NOVA"] },
      {
        target: "dialogue",
        sources: ["(*softly*)", "Line *one", "Line two* x"],
        aligned: true,
      },
    ],
  },
];

const SPANS = new Set([
  "Bold",
  "BoldItalic",
  "Italic",
  "Underline",
  "Centered",
  "EmphasisTilde",
  "EmphasisColon",
  "Raw",
]);

const SCOPE_STYLES: [scope: string, style: string][] = [
  ["markup.other.bold.sd", "bold"],
  ["markup.other.italic.sd", "italic"],
  ["markup.other.underline.sd", "underline"],
  ["constant.character.escape.centered.sd", "centered"],
  ["markup.emphasis.tilde.sd", "wavy"],
  ["markup.emphasis.colon.sd", "shaky"],
];

const stylesOfScopes = (scopes: string[]): string => {
  const styles = SCOPE_STYLES.filter(([scope]) => scopes.includes(scope)).map(
    ([, style]) => style,
  );
  if (scopes.filter((scope) => scope.startsWith("markup.raw.")).length >= 2) {
    styles.push("raw");
  }
  return styles.sort().join(" ");
};

interface Cell {
  char: string;
  style: string;
}

const script = (body: string, values = VALUES) =>
  `${SCREEN}\n${values}\n-> start\n\nscene start\n  ${body}\nend\n`;

async function grammarCells(source: string, from: number, to: number) {
  const tree = parseSource(source);
  const vscode = await vscodeScopeStacksPerChar(source);
  const hidden = new Set<number>();
  const values = new Map<number, number>();
  const cursor = tree.cursor();
  do {
    const name = cursor.name;
    const span = name.replace(/_(begin|end)$/, "");
    if (
      (name !== span && SPANS.has(span)) ||
      /^Escape_c[135]$/.test(name) ||
      /^SparkdownBlockComment(OnLine)?$/.test(name)
    ) {
      for (let i = cursor.from; i < cursor.to; i++) hidden.add(i);
    }
    if (name === "LuauInterpolatedStringExpression") {
      values.set(cursor.from, cursor.to);
    }
  } while (cursor.next());
  const tree_: Cell[] = [];
  const vsc: Cell[] = [];
  for (let i = from; i < to; ) {
    const valueEnd = values.get(i);
    const treeStyle = stylesOfScopes(treeScopeStackAt(tree, i));
    const vscStyle = stylesOfScopes(vscode[i] ?? []);
    if (valueEnd != null) {
      for (const char of "plain") {
        tree_.push({ char, style: treeStyle });
        vsc.push({ char, style: vscStyle });
      }
      i = valueEnd;
      continue;
    }
    if (!hidden.has(i)) {
      tree_.push({ char: source[i]!, style: treeStyle });
      vsc.push({ char: source[i]!, style: vscStyle });
    }
    i++;
  }
  return { tree: tree_, vscode: vsc };
}

async function renderedBeat(source: string) {
  const harness = createHarness(source);
  await harness.ready;
  harness.jumpToFlow("start");
  harness.reset();
  const beat = harness.nextBeat() as Instructions;
  await harness.display(beat, true);
  await flushMicrotasks();
  const animation = (harness.game.context as any)?.animation ?? {};
  const wavy = animation["wavy"]?.$name;
  const shaky = animation["shaky"]?.$name;
  const cellsOf = (target: string): Cell[] => {
    const cells: Cell[] = [];
    for (const event of beat.text?.[target] ?? []) {
      const style = (event.style ?? {}) as Record<string, unknown>;
      const styles = [
        style["font_weight"] === "bold" ? "bold" : "",
        style["font_style"] === "italic" ? "italic" : "",
        style["text_decoration"] === "underline" ? "underline" : "",
        style["text_align"] === "center" ? "centered" : "",
        style["white_space"] === "pre" ? "raw" : "",
        wavy && style["animation_name"] === wavy ? "wavy" : "",
        shaky && style["animation_name"] === shaky ? "shaky" : "",
      ].filter(Boolean);
      for (const char of event.text ?? "") {
        cells.push({ char, style: styles.sort().join(" ") });
      }
    }
    return cells;
  };
  return cellsOf;
}

const show = (cells: Cell[]): string => {
  let out = "";
  let current = "";
  for (const { char, style } of cells) {
    if (style !== current) {
      out += (current ? "]" : "") + (style ? `[${style}: ` : "");
      current = style;
    }
    out += char;
  }
  return out + (current ? "]" : "");
};

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

describe("a mark inside an inserted value is styled within the value only", () => {
  test("a value's star does not close the script's italic span", async () => {
    const cellsOf = await renderedBeat(
      script("*far {x} away", `store x = "a* b"\n`),
    );
    expect(show(cellsOf("action"))).toBe("[italic: far a b away]");
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
      script("E {opener} F", `store opener = "\\u{E101}z"\n`),
    );
    expect(show(opening("action"))).toBe("E z F");
  });

  test("a value's unclosed mark ends with the value", async () => {
    const cellsOf = await renderedBeat(
      script("Value {y} here", `store y = "*b"\n`),
    );
    expect(show(cellsOf("action"))).toBe("Value [italic: b] here");
  });
});
