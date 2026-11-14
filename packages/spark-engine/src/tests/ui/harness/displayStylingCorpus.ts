import MARK_PAIRING from "@impower/sparkdown/src/tests/compiler/fixtures/mark-pairing-corpus.json";
import { parseSource } from "@impower/sparkdown/src/tests/compiler/grammarSnapshot";
import {
  treeScopeStackAt,
  vscodeScopeStacksPerChar,
} from "@impower/sparkdown/src/tests/compiler/scopeEquality";
import type { Cell } from "./displayStyleHarness";

interface Part {
  target: string;
  sources: string[];
  aligned?: boolean;
}

export interface Case {
  label: string;
  body: string;
  parts?: Part[];
}

const action = (body: string): Case => ({
  label: body,
  body,
  parts: [{ target: "action", sources: [body] }],
});

const MARKS: Record<string, string> = {
  bold: "**",
  italic: "*",
  underline: "_",
  centered: "^",
  wavy: "~~",
  shaky: "::",
};

const PAIRS: Case[] = Object.values(MARKS).flatMap((outer) => [
  ...Object.values(MARKS)
    .filter((inner) => inner !== outer)
    .map((inner) => action(`A ${outer}a ${inner}b${inner} c${outer} D`)),
  action(`A ${outer}a \`b\` c${outer} D`),
]);

const ANIMATIONS_INSIDE: Case[] = ["**", "*", "_", "^"].flatMap((outer) => [
  action(`A ${outer}a ~~b ::c:: d~~ e${outer} F`),
  action(`A ${outer}a ::b ~~c~~ d:: e${outer} F`),
]);

export const CORPUS: Case[] = [
  ...PAIRS,
  ...ANIMATIONS_INSIDE,
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
  action("A *a `far {x} away` b* c"),
  action("A *a `far {x -- c} away` b* c"),
  action(`A ${"_".repeat(40)}long${"_".repeat(40)} B`),
  action("**bold /* c */ more** end"),
  action("*a /* c */ b* c"),
  action("A <b>word</b> here."),
  action("A <b2>word</b2> here."),
  action("A *a <u>b</u> c* d"),
  action("A <i>*a* b</i> c"),
  action("A **a <speed:0.5>b** c"),
  action("A <color:red>_a_</color> <x> b"),
  action("A <wait:1>*b* <p:2>c"),
  action("A *a <b>b* c</b> d"),
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

export async function grammarCells(source: string, from: number, to: number) {
  return cellsBetween(await grammarReading(source), source, from, to);
}

export async function grammarReading(source: string) {
  return { ...treeReading(source), vscode: await vscodeScopeStacksPerChar(source) };
}

export function treeReading(source: string): GrammarReading {
  const tree = parseSource(source);
  const hidden = new Set<number>();
  const values = new Map<number, number>();
  const cursor = tree.cursor();
  do {
    const name = cursor.name;
    if (
      /^Span(Open|Close)Mark$/.test(name) ||
      /^Escape_c[135]$/.test(name) ||
      /^SparkdownBlockComment(OnLine)?$/.test(name) ||
      name === "TextCommand"
    ) {
      for (let i = cursor.from; i < cursor.to; i++) hidden.add(i);
    }
    if (name === "LuauInterpolatedStringExpression") {
      values.set(cursor.from, cursor.to);
    }
  } while (cursor.next());
  return { tree, vscode: [], hidden, values };
}

interface GrammarReading {
  tree: ReturnType<typeof parseSource>;
  vscode: string[][];
  hidden: Set<number>;
  values: Map<number, number>;
}

export function cellsBetween(
  { tree, vscode, hidden, values }: GrammarReading,
  source: string,
  from: number,
  to: number,
) {
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

export const PAIRING_LINES = (MARK_PAIRING as { lines: { line: string }[] }).lines
  .map(({ line }) => line)
  .filter((line) => !/[<>]|\[\[|\(\(/.test(line));

export const SUPPRESSION_OPEN = "punctuation.definition.template-expression.begin.choice.suppression.sd";
export const SUPPRESSION_CLOSE = "punctuation.definition.template-expression.end.choice.suppression.sd";

export const CHOICE_CORPUS: string[] = [
  "Go *far* now",
  "Go [*far*] now",
  "Go [far] *now*",
  "Go **a** [_b_] ^c^ d",
  "Go ~~a~~ [::b::] `c` d",
  "Go *far {x} away* now",
  "Go [*far {x}*] now",
  "Go [a] *b {x} c* d",
  "Go *far away",
  "Go [*far] away",
  "Go [far] *away",
  "Go *a* [b] c",
  "Go [a *b] c* d",
  "Cross *far [away] now* x",
  "Go *far [away* now] x",
  "Go [far *away] now* x",
  "Go _a [b] c_ d",
  "Go **a [b** c] d",
  "Go [a ~~b] c~~ d",
  "Go ^a [b] c^ d",
  "Go ::a [b] c:: d",
  "Go `a [b] c` d",
  "Go *a [b]*",
  "Go [*a] b*",
  "Go *{x} [b] {x}* end",
  "Go *a **b [c** d] e* f",
  "Go *a `far {x -- c} away` b* now",
  "Go *a `far {[[a]]} away` b* now",
  "Go `far {\"->\"} away` now",
  "Go [`far {t[1]} away`] now",
  "Go `far {[[a [[ b]]} away` now",
  "Go `far {\"}->\"} away` now",
  "Go `far [a] away` now",
  "Go `far -> next` now",
  "Go [`far ] away`] now",
  "Go `far [away` now] then",
  "Go [far `away] now` then",
  "Go `far { ({ { {x} } })[1] } away` now",
  "Go `far {[[a } -> next} away` now",
  "Go `far [away] now",
  "Go [a] `b -> next` now",
  "Go [```a -> next ] b```] now",
  "Go [```a ] b``` now",
  "Go x`a` now",
  "Go (`a` now",
  "Go [`a` now",
  "Go x^a^ y",
  "Go x~~a~~ y",
  "Go \\[a] [b] c",
  "Go [a\\] b] c",
  "Go *a* [b *c] d",
  "Go *x [*b*] c",
  "Go [a *b] *c* d",
  "Go <b>far</b> now",
  "Go [<b>far</b>] *now*",
  "Go *a <x>b* [c <i>d] e",
  ...["*", "**", "_", "^", "~~", "::", "`"].flatMap((mark) => [
    `Go ${mark}a [b${mark} c] d`,
    `Go ${mark}a [b] c${mark} d`,
    `Go [a ${mark}b] c${mark} d`,
  ]),
];
