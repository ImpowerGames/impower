import { Grammar } from "@impower/textmate-grammar-tree/src/grammar/classes/Grammar";
import {
  ResumableTokenizer,
  type TokenizerResume,
} from "@impower/textmate-grammar-tree/src/grammar/classes/ResumableTokenizer";
import { type GrammarDefinition } from "@impower/textmate-grammar-tree/src/grammar/types/GrammarDefinition";
import { type GrammarToken } from "@impower/textmate-grammar-tree/src/core/types/GrammarToken";
import { describe, expect, it } from "vitest";

const LINE_RULES = {
  Line: {
    id: "Line",
    patterns: [{ include: "#Newline" }, { include: "#Indent" }, { include: "#Stmt" }],
  },
  Stmt: {
    id: "Stmt",
    match: "([A-Za-z_][A-Za-z0-9_]*)",
    captures: { "1": { id: "Word", tag: "word" } },
  },
  Newline: { id: "Newline", match: "(\\n)", captures: { "1": { id: "NL" } } },
  Indent: { id: "Indent", match: "([ \\t]+)", captures: { "1": { id: "WS" } } },
};

const NESTED_BLOCKS: GrammarDefinition = {
  name: "nestedBlocks",
  patterns: [{ include: "#Block" }, { include: "#Line" }],
  repository: {
    Block: {
      id: "Block",
      begin: "(block)\\b",
      beginCaptures: { "1": { id: "BlockKeyword", tag: "keyword" } },
      end: "([ \\t]*)(end)\\b",
      endCaptures: {
        "1": { id: "EndIndent", tag: "indent" },
        "2": { id: "EndKeyword", tag: "keyword" },
      },
      contentTag: "BlockContent",
      patterns: [{ include: "#Block" }, { include: "#Newline" }, { include: "#Indent" }, { include: "#Stmt" }],
    },
    ...LINE_RULES,
  },
};

const CASCADE_CLOSE: GrammarDefinition = {
  name: "cascadeClose",
  patterns: [{ include: "#Loop" }, { include: "#Line" }],
  repository: {
    Loop: {
      id: "Loop",
      begin: "(loop)\\b",
      beginCaptures: { "1": { id: "LoopKw", tag: "keyword" } },
      end: "(?<=\\bend\\b)",
      contentTag: "LoopContent",
      patterns: [{ include: "#Do" }, { include: "#Newline" }, { include: "#Indent" }, { include: "#Stmt" }],
    },
    Do: {
      id: "Do",
      begin: "(do)\\b",
      beginCaptures: { "1": { id: "DoKw", tag: "keyword" } },
      end: "([ \\t]*)(end)\\b",
      endCaptures: {
        "1": { id: "DoEndIndent", tag: "indent" },
        "2": { id: "DoEndKw", tag: "keyword" },
      },
      contentTag: "DoContent",
      patterns: [{ include: "#Newline" }, { include: "#Indent" }, { include: "#Stmt" }],
    },
    ...LINE_RULES,
  },
};

const BACKREFERENCE: GrammarDefinition = {
  name: "backreference",
  patterns: [{ include: "#Heredoc" }, { include: "#Line" }],
  repository: {
    Heredoc: {
      id: "Heredoc",
      begin: "(<<)([A-Z]+)",
      beginCaptures: {
        "1": { id: "HOpen", tag: "punctuation" },
        "2": { id: "HTag", tag: "tag" },
      },
      end: "(\\2)",
      endCaptures: { "1": { id: "HEnd", tag: "tag" } },
      contentTag: "HContent",
      patterns: [{ include: "#Newline" }, { include: "#Indent" }, { include: "#Stmt" }],
    },
    ...LINE_RULES,
  },
};

const lineStartOf = (src: string, pos: number) => src.lastIndexOf("\n", pos - 1) + 1;

function tokenize(
  grammar: Grammar,
  src: string,
  restart?: { at: number; resume: TokenizerResume },
  snapshotAt?: number,
): { tokens: GrammarToken[]; snapshot?: TokenizerResume } {
  const anchor = restart
    ? lineStartOf(src, Math.min(restart.resume.openedAtAbs[0] ?? restart.at, restart.at))
    : 0;
  const tokenizer = new ResumableTokenizer(grammar, (p) => src.slice(p), anchor);
  if (restart) {
    tokenizer.restore(restart.resume, restart.at);
  }
  const tokens: GrammarToken[] = [];
  let snapshot: TokenizerResume | undefined;
  while (!tokenizer.done) {
    if (snapshotAt != null && snapshot == null && tokenizer.absolutePos === snapshotAt) {
      snapshot = tokenizer.snapshot();
    }
    const step = tokenizer.step();
    for (const t of step.tokens) {
      tokens.push([t[0], t[1], t[2], t[3]?.slice(), t[4]?.slice()]);
    }
  }
  return { tokens, snapshot };
}

function fmt(grammar: Grammar, src: string, tokens: GrammarToken[]): string {
  const name = (id: number | null) => (id == null ? "." : (grammar.nodeNames[id] ?? `#${id}`));
  return tokens
    .map(([id, from, to, open, close]) => {
      const o = open?.length ? ` open=[${open.map(name).join(",")}]` : "";
      const c = close?.length ? ` close=[${close.map(name).join(",")}]` : "";
      return `${from}..${to} ${name(id)} ${JSON.stringify(src.slice(from, to))}${o}${c}`;
    })
    .join("\n");
}

const cases: [string, GrammarDefinition, string, number[]][] = [
  ["nested consuming blocks", NESTED_BLOCKS, "block\n  foo\n  block\n    bar\n  end\n  baz\nend\n", [20, 34]],
  ["a zero-width outer end closing after a consuming inner end", CASCADE_CLOSE, "loop\n  do\n    x\n  end\n", [10]],
  ["an end that back-references a begin capture", BACKREFERENCE, "<<EOF\n  hi\n  there\nEOF\n", [8, 11]],
];

describe("a tokenizer restored from a mid-block snapshot tokenizes the rest as a cold run does", () => {
  for (const [label, definition, src, restarts] of cases) {
    const grammar = new Grammar(definition, (_typeIndex, typeId) => ({ name: typeId }));
    for (const at of restarts) {
      it(`${label}, restarted at ${at}`, () => {
        const cold = tokenize(grammar, src, undefined, at);
        expect(cold.snapshot, `a step boundary at ${at}`).toBeTruthy();
        expect(cold.snapshot!.frames.length).toBeGreaterThan(0);
        const restarted = tokenize(grammar, src, { at, resume: cold.snapshot! });
        const suffix = cold.tokens.filter((t) => t[1] >= at);
        expect(fmt(grammar, src, restarted.tokens)).toBe(fmt(grammar, src, suffix));
      });
    }
  }
});
