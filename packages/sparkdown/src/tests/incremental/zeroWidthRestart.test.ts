import { TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { cachedCompilerProp } from "@impower/textmate-grammar-tree/src/tree/props/cachedCompilerProp";
import { printTree } from "@impower/textmate-grammar-tree/src/tree/utils/printTree";
import { type Tree, TreeFragment } from "@lezer/common";
import { describe, expect, it, vi } from "vitest";
import { getParser } from "../compiler/grammarSnapshot";

function parseWatched(parse: () => Tree) {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const tree = parse();
    const loops = warn.mock.calls.filter((call) => /Possible infinite loop/.test(String(call[0]))).length;
    return { tree, loops };
  } finally {
    warn.mockRestore();
  }
}

function zeroWidth(tree: Tree): string[] {
  const out: string[] = [];
  for (let child = tree.topNode.firstChild; child; child = child.nextSibling) {
    if (child.from === child.to) out.push(`${child.name} ${child.from}`);
  }
  return out;
}

describe("a line that starts with a `#` run that is not a tag (#1614)", () => {
  const LINES = [
    "#x",
    "#x #t",
    "  #x",
    "\t#x",
    "^: #x",
    "$: #x",
    "%: #x",
    ": #x",
    "Hello\n#x there",
    "@ Bob\n#x",
    "@ Bob\nHi\n#x",
    "@ Bob\n  #x",
    "scene A\n  #x\nend",
    't("end\n#", .. .)\n    local step = 3',
    "..#x",
    "  ..#x",
    "Hi\n..#x",
    "^: ..#x",
    "$: ..#x",
    "%: ..#x",
    "@ Bob\n..#x",
  ];

  it.each(LINES)("parses %j with no empty-match backstop and no zero-width line", (text) => {
    const { tree, loops } = parseWatched(() => getParser().parse(text));
    expect(loops).toBe(0);
    expect(zeroWidth(tree)).toEqual([]);
  });

  it.each([
    ["#x", "ImplicitAction 0..2"],
    ["  #x", "ImplicitAction 0..4"],
    ["^: #x", "InlineTitle 0..5"],
    ["$: #x", "InlineHeading 0..5"],
    ["%: #x", "InlineTransitional 0..5"],
    [": #x", "InlineAction 0..4"],
    ["..#x", "InlineAction 0..4"],
    ["^: ..#x", "InlineTitle 0..7"],
  ])("keeps %j on its line rule, as text", (text, line) => {
    const { tree } = parseWatched(() => getParser().parse(text));
    const top: string[] = [];
    for (let child = tree.topNode.firstChild; child; child = child.nextSibling) {
      top.push(`${child.name} ${child.from}..${child.to}`);
    }
    expect(top).toEqual([line]);
  });
});

describe("an incremental parse that restarts after zero-width nodes (#1614)", () => {
  const parser = new TextmateGrammarParser({
    name: "mini",
    scopeName: "source.mini",
    patterns: [{ include: "#Empty" }, { include: "#Word" }, { include: "#Space" }, { include: "#Newline" }],
    repository: {
      Empty: { name: "empty.mini", begin: "(?=#)", end: "(?=#)" },
      Word: { name: "word.mini", match: "[a-z]+" },
      Space: { name: "space.mini", match: " " },
      Newline: { name: "newline.mini", match: "\n" },
    },
  } as never);
  parser.lookaheadStart = (input, pos) => {
    const hash = input.read(0, pos).lastIndexOf("#");
    return hash < 0 ? pos : hash;
  };

  const PAD = "aa bb cc dd ee ff gg hh ii jj kk ll mm nn oo pp qq rr ss tt uu vv ww xx yy zz\n".repeat(2);
  const TEXT = `${PAD}aa\nbb\n#\ncc dd ee ff gg\nhh`;

  it("holds the zero-width nodes a cold parse holds, for an insertion at each offset after the `#`", () => {
    const hash = TEXT.indexOf("#");
    const restarts: number[] = [];
    const mismatches: string[] = [];
    for (let at = hash + 1; at < TEXT.length; at++) {
      const next = `${TEXT.slice(0, at)}z${TEXT.slice(at)}`;
      const incremental = parseWatched(() => {
        const before = parser.parse(TEXT);
        const fragments = TreeFragment.applyChanges(TreeFragment.addTree(before), [
          { fromA: at, toA: at, fromB: at, toB: at + 1 },
        ]);
        return parser.parse(next, fragments);
      }).tree;
      const cold = parseWatched(() => parser.parse(next)).tree;
      const cached: any = incremental.prop(cachedCompilerProp as any);
      restarts.push(cached?.reparsedFrom ?? 0);
      if (printTree(incremental, next) !== printTree(cold, next)) {
        mismatches.push(`insertion at ${at}`);
      }
    }
    expect(Math.min(...restarts), "every edit restarts the parse partway through").toBeGreaterThan(0);
    expect(mismatches).toEqual([]);
  });
});
