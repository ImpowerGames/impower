import { Grammar } from "@impower/textmate-grammar-tree/src/grammar/classes/Grammar";
import { GrammarState } from "@impower/textmate-grammar-tree/src/grammar/classes/GrammarState";
import { MatchRule } from "@impower/textmate-grammar-tree/src/grammar/classes/rules/MatchRule";
import { ScopedRule } from "@impower/textmate-grammar-tree/src/grammar/classes/rules/ScopedRule";
import { SwitchRule } from "@impower/textmate-grammar-tree/src/grammar/classes/rules/SwitchRule";
import { type GrammarStackElement } from "@impower/textmate-grammar-tree/src/grammar/types/GrammarStackElement";
import { type GrammarDefinition } from "@impower/textmate-grammar-tree/src/grammar/types/GrammarDefinition";
import { NodeID } from "@impower/textmate-grammar-tree/src/core/enums/NodeID";
import { describe, expect, it } from "vitest";

const GRAMMAR_DEFINITION: GrammarDefinition = {
  name: "spike",
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
      patterns: [
        { include: "#Block" },
        { include: "#Newline" },
        { include: "#Indent" },
        { include: "#Stmt" },
      ],
    },
    Line: {
      id: "Line",
      patterns: [
        { include: "#Newline" },
        { include: "#Indent" },
        { include: "#Stmt" },
      ],
    },
    Stmt: {
      id: "Stmt",
      match: "([A-Za-z_][A-Za-z0-9_]*)",
      captures: { "1": { id: "Word", tag: "word" } },
    },
    Newline: { id: "Newline", match: "(\\n)", captures: { "1": { id: "NL" } } },
    Indent: { id: "Indent", match: "([ \\t]+)", captures: { "1": { id: "WS" } } },
  },
};

function makeGrammar(def: GrammarDefinition): Grammar {
  return new Grammar(def, (_typeIndex, typeId) => ({ name: typeId }));
}

const cache = new WeakMap<GrammarDefinition, Grammar>();
function getGrammar(def: GrammarDefinition = GRAMMAR_DEFINITION): Grammar {
  let g = cache.get(def);
  if (!g) {
    g = makeGrammar(def);
    cache.set(def, g);
  }
  return g;
}

type Token = [
  id: number | null,
  from: number,
  to: number,
  open?: number[],
  close?: number[],
];

function wholeBlockTokens(grammar: Grammar, src: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  while (pos < src.length) {
    const next = (p: number) => src.slice(p);
    const match = grammar.match(src, next, pos, pos);
    if (match) {
      for (const t of match.compile()) tokens.push(t as Token);
      pos += match.length;
    } else {
      tokens.push([NodeID.unrecognized, pos, pos + 1, undefined, undefined]);
      pos += 1;
    }
  }
  return tokens;
}

interface Frame {
  rule: ScopedRule;
  contentNode: number;
  contentOpened: boolean;
}

export interface ResumeSnapshot {
  stack: GrammarStackElement[];
  frames: { ruleId: string; contentOpened: boolean }[];
}

function matchStep(
  rules: any[],
  state: GrammarState,
  pos: number,
): { kind: "scope"; rule: ScopedRule; matched: any } | { kind: "leaf"; matched: any } | null {
  for (const R of rules) {
    if (R instanceof ScopedRule) {
      const b = R.begin(state, pos);
      if (b) return { kind: "scope", rule: R, matched: b };
    } else if (R instanceof MatchRule) {
      const m = R.match(state, pos);
      if (m) return { kind: "leaf", matched: m };
    } else if (R instanceof SwitchRule) {
      R.resolve();
      const inner = matchStep((R as any).rules ?? [], state, pos);
      if (inner) return inner;
    }
  }
  return null;
}

function perLineTokenize(
  grammar: Grammar,
  src: string,
  opts?: {
    from?: number;
    resume?: ResumeSnapshot;
    captureAt?: number[];
    captureInto?: Map<number, ResumeSnapshot>;
  },
): Token[] {
  const next = (p: number) => src.slice(p);
  const state = new GrammarState(src, next, 0);
  const frames: Frame[] = [];
  const tokens: Token[] = [];
  let lastToken: Token | null = null;
  let pos = opts?.from ?? 0;

  const ruleById = new Map<string, ScopedRule>();
  const collect = (rules: any[]) => {
    for (const R of rules) {
      if (R instanceof ScopedRule && !ruleById.has(R.id)) {
        ruleById.set(R.id, R);
        R.contentRule.resolve();
        collect((R.contentRule as any).rules ?? []);
      } else if (R instanceof SwitchRule) {
        R.resolve();
        collect((R as any).rules ?? []);
      }
    }
  };
  collect(grammar.rules as any[]);

  if (opts?.resume) {
    (state.stack as any).stack = opts.resume.stack.map((e) => ({
      node: e.node,
      beginCaptures: e.beginCaptures.slice(),
    }));
    for (const f of opts.resume.frames) {
      const rule = ruleById.get(f.ruleId)!;
      frames.push({
        rule,
        contentNode: rule.contentRule.node.typeIndex,
        contentOpened: f.contentOpened,
      });
    }
  }

  const emit = (compiled: any[], contentOf: Frame | null) => {
    for (let i = 0; i < compiled.length; i++) {
      const t = compiled[i] as Token;
      if (contentOf && !contentOf.contentOpened && i === 0) {
        t[3] = t[3] ?? [];
        t[3].unshift(contentOf.contentNode);
        contentOf.contentOpened = true;
      }
      tokens.push(t);
      lastToken = t;
    }
  };

  const tryEnd = (): boolean => {
    const top = frames[frames.length - 1]!;
    const S = top.rule;
    const endMatched = S.end(state, pos);
    if (!endMatched) return false;
    if (top.contentOpened && lastToken) {
      lastToken[4] = lastToken[4] ?? [];
      lastToken[4].push(top.contentNode);
    }
    for (const t of endMatched.compile()) {
      tokens.push(t as Token);
      lastToken = t as Token;
    }
    frames.pop();
    pos += endMatched.length;
    return true;
  };

  const tryContent = (): boolean => {
    const top = frames[frames.length - 1]!;
    const S = top.rule;
    S.contentRule.resolve();
    const step = matchStep((S.contentRule as any).rules ?? [], state, pos);
    if (!step) return false;
    if (step.kind === "scope") {
      emit(step.matched.compile(), top);
      frames.push({
        rule: step.rule,
        contentNode: step.rule.contentRule.node.typeIndex,
        contentOpened: false,
      });
      pos += step.matched.length;
    } else {
      emit(step.matched.compile(), top);
      pos += Math.max(step.matched.length, 1) === 0 ? 1 : step.matched.length;
      if (step.matched.length === 0) pos += 1;
    }
    return true;
  };

  const tryTop = (): boolean => {
    const step = matchStep(grammar.rules as any[], state, pos);
    if (!step) return false;
    emit(step.matched.compile(), null);
    if (step.kind === "scope") {
      frames.push({
        rule: step.rule,
        contentNode: step.rule.contentRule.node.typeIndex,
        contentOpened: false,
      });
    }
    pos += step.matched.length || 1;
    return true;
  };

  const captureSet = new Set(opts?.captureAt ?? []);
  const snapshot = (): ResumeSnapshot => ({
    stack: (state.stack as any).stack.map((e: GrammarStackElement) => ({
      node: e.node,
      beginCaptures: e.beginCaptures.slice(),
    })),
    frames: frames.map((f) => ({
      ruleId: f.rule.id,
      contentOpened: f.contentOpened,
    })),
  });

  let guard = 0;
  while (pos < src.length) {
    if (++guard > 100000) throw new Error("loop guard tripped");
    if (captureSet.has(pos) && opts?.captureInto && !opts.captureInto.has(pos)) {
      opts.captureInto.set(pos, snapshot());
    }
    if (frames.length) {
      const S = frames[frames.length - 1]!.rule;
      if (!S.applyEndPatternLast && tryEnd()) continue;
      if (tryContent()) continue;
      if (S.applyEndPatternLast && tryEnd()) continue;
      tokens.push([NodeID.unrecognized, pos, pos + 1, undefined, undefined]);
      lastToken = tokens[tokens.length - 1]!;
      pos += 1;
    } else {
      if (tryTop()) continue;
      tokens.push([NodeID.unrecognized, pos, pos + 1, undefined, undefined]);
      pos += 1;
    }
  }

  return tokens;
}

function fmt(grammar: Grammar, src: string, tokens: Token[]): string {
  const name = (id: number | null) =>
    id == null ? "·" : (grammar.nodeNames[id] ?? `#${id}`);
  return tokens
    .map((t) => {
      const [id, from, to, open, close] = t;
      const text = JSON.stringify(src.slice(from, to));
      const o = open?.length ? ` open=[${open.map(name).join(",")}]` : "";
      const c = close?.length ? ` close=[${close.map(name).join(",")}]` : "";
      return `${String(from).padStart(3)}..${String(to).padEnd(3)} ${name(id).padEnd(14)} ${text}${o}${c}`;
    })
    .join("\n");
}

const GRAMMAR_B: GrammarDefinition = {
  name: "spikeB",
  patterns: [{ include: "#Loop" }, { include: "#Line" }],
  repository: {
    Loop: {
      id: "Loop",
      begin: "(loop)\\b",
      beginCaptures: { "1": { id: "LoopKw", tag: "keyword" } },
      end: "(?<=\\bend\\b)",
      contentTag: "LoopContent",
      patterns: [
        { include: "#Do" },
        { include: "#Newline" },
        { include: "#Indent" },
        { include: "#Stmt" },
      ],
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
      patterns: [
        { include: "#Newline" },
        { include: "#Indent" },
        { include: "#Stmt" },
      ],
    },
    Line: {
      id: "Line",
      patterns: [
        { include: "#Newline" },
        { include: "#Indent" },
        { include: "#Stmt" },
      ],
    },
    Stmt: {
      id: "Stmt",
      match: "([A-Za-z_][A-Za-z0-9_]*)",
      captures: { "1": { id: "Word", tag: "word" } },
    },
    Newline: { id: "Newline", match: "(\\n)", captures: { "1": { id: "NL" } } },
    Indent: { id: "Indent", match: "([ \\t]+)", captures: { "1": { id: "WS" } } },
  },
};

const GRAMMAR_C: GrammarDefinition = {
  name: "spikeC",
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
      patterns: [
        { include: "#Newline" },
        { include: "#Indent" },
        { include: "#Stmt" },
      ],
    },
    Line: {
      id: "Line",
      patterns: [
        { include: "#Newline" },
        { include: "#Indent" },
        { include: "#Stmt" },
      ],
    },
    Stmt: {
      id: "Stmt",
      match: "([A-Za-z_][A-Za-z0-9_]*)",
      captures: { "1": { id: "Word", tag: "word" } },
    },
    Newline: { id: "Newline", match: "(\\n)", captures: { "1": { id: "NL" } } },
    Indent: { id: "Indent", match: "([ \\t]+)", captures: { "1": { id: "WS" } } },
  },
};

const SRC_A = "block\n  foo\n  block\n    bar\n  end\n  baz\nend\n";
const SRC_B = "loop\n  do\n    x\n  end\n";
const SRC_C = "<<EOF\n  hi\n  there\nEOF\n";

function runCase(
  label: string,
  def: GrammarDefinition,
  src: string,
  restartAt: number[],
) {
  describe(label, () => {
    const grammar = getGrammar(def);

    it("stage 2 — per-line machine is BYTE-IDENTICAL to whole-block oracle", () => {
      const oracle = fmt(grammar, src, wholeBlockTokens(grammar, src));
      const perLine = fmt(grammar, src, perLineTokenize(grammar, src));
      if (process.env["SPIKE_DUMP"] && oracle !== perLine) {
        console.log(`\n=== [${label}] ORACLE ===\n` + oracle);
        console.log(`\n=== [${label}] PER-LINE ===\n` + perLine);
      }
      expect(perLine).toBe(oracle);
    });

    for (const at of restartAt) {
      it(`stage 3 — RESTART from a mid-block snapshot at pos ${at} reproduces the suffix`, () => {
        const captureInto = new Map<number, ResumeSnapshot>();
        perLineTokenize(grammar, src, { captureAt: [at], captureInto });
        const snap = captureInto.get(at);
        expect(snap, `snapshot captured at ${at}`).toBeTruthy();
        expect(snap!.frames.length).toBeGreaterThan(0);

        const restarted = perLineTokenize(grammar, src, { from: at, resume: snap });
        const suffix = wholeBlockTokens(grammar, src).filter((t) => t[1] >= at);

        const restartedStr = fmt(grammar, src, restarted);
        const suffixStr = fmt(grammar, src, suffix);
        if (process.env["SPIKE_DUMP"] && restartedStr !== suffixStr) {
          console.log(`\n=== [${label}] RESTART@${at} ===\n` + restartedStr);
          console.log(`\n=== [${label}] ORACLE SUFFIX@${at} ===\n` + suffixStr);
        }
        expect(restartedStr).toBe(suffixStr);
      });
    }
  });
}

describe("matcher-resume spike — Case A oracle sanity", () => {
  const grammar = getGrammar(GRAMMAR_DEFINITION);
  it("whole-block oracle nests correctly", () => {
    const tokens = wholeBlockTokens(grammar, SRC_A);
    if (process.env["SPIKE_DUMP"]) {
      console.log("\n=== [A] ORACLE ===\n" + fmt(grammar, SRC_A, tokens));
    }
    const blockId = grammar.nodeNames.indexOf("Block");
    const opens = tokens.flatMap((t) => t[3] ?? []);
    const closes = tokens.flatMap((t) => t[4] ?? []);
    expect(opens.filter((id) => id === blockId).length).toBe(2);
    expect(closes.filter((id) => id === blockId).length).toBe(2);
  });
});

runCase("Case A — nested consuming blocks", GRAMMAR_DEFINITION, SRC_A, [20, 34]);
runCase("Case B — cascade-close (zero-width outer + consuming inner)", GRAMMAR_B, SRC_B, [10]);
runCase("Case C — beginCaptures backreference across restart", GRAMMAR_C, SRC_C, [8, 11]);
runCase("Case A2 — single content child (FULL content wrap)", GRAMMAR_DEFINITION, "block\nend\n", []);
