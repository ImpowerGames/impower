import { CompileStack } from "@impower/textmate-grammar-tree/src/compiler/classes/CompileStack";
import { GrammarState } from "@impower/textmate-grammar-tree/src/grammar/classes/GrammarState";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import onig from "vscode-oniguruma";
import vstm from "vscode-textmate";
import { describe, expect, test, vi } from "vitest";
import { parseSource } from "./grammarSnapshot";
import { LUAU_FILE_SCOPE_NAME, tokenize } from "./vscodeGrammarSnapshot";

const __dirname = dirname(fileURLToPath(import.meta.url));
const grammar = JSON.parse(readFileSync(join(__dirname, "../../../language/sparkdown.language-grammar.json"), "utf8"));
const VSCODE_GRAMMAR = join(__dirname, "../../../../../vscode-sparkdown/language/sparkdown.language-grammar.json");
const LUAU_FILE_GRAMMAR = join(__dirname, "../../../language/sparkdown-luau.language-grammar.json");

const BRACES = 2000;

const PLACES: [string, (unit: string) => string][] = [
  ["a display line", (unit) => `scene start\n  A${unit.repeat(BRACES)}\nend\n`],
  ["a choice start", (unit) => `scene start\n  choose\n    + ${unit.repeat(BRACES)}\n      done\n  end\nend\n`],
];

const fastest = (read: () => unknown) => {
  let best = Infinity;
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    read();
    best = Math.min(best, performance.now() - t0);
  }
  return best;
};

const LONG_LINES: [string, (items: number) => string][] = [
  ["unclosed braces", (n) => `  A${" {b".repeat(n)}`],
  ["closed braces", (n) => `  A${" {b}".repeat(n)}`],
  ["a sum", (n) => `  A {b${" + b".repeat(n)}}`],
  ["comparisons joined by and", (n) => `  A {${"b == c and ".repeat(n)}b}`],
  ["call arguments", (n) => `  A {f(${"b, ".repeat(n)}b)}`],
  ["call arguments with longer names", (n) => `  A {f(${"value, ".repeat(n)}value)}`],
  ["call arguments after two spaces", (n) => `  A {f(${"b,  ".repeat(n)}b)}`],
  ["a dotted path with spaces", (n) => `  A {${"b.  ".repeat(n)}b}`],
  ["table fields with longer names", (n) => `  A {{${"value = 1, ".repeat(n)}}}`],
  ["table fields", (n) => `  A {{${"b = 1, ".repeat(n)}}}`],
  ["a dotted path", (n) => `  A {${"b.".repeat(n)}b}`],
  ["joined strings", (n) => `  A {${'"x" .. '.repeat(n)}"x"}`],
  ["a method chain", (n) => `  A {a${":m()".repeat(n)}}`],
  ["an index chain", (n) => `  A {a${"[b]".repeat(n)}}`],
  ["a local's sum", (n) => `  local x = b${" + b".repeat(n)}`],
  ["a local's call", (n) => `  local x = f(${"b, ".repeat(n)}b)`],
  ["a local's table", (n) => `  local x = {${"b = 1, ".repeat(n)}}`],
  ["if expressions", (n) => `  local x = ${"if a then b else ".repeat(n)}c`],
];

const FEW = 500;

const inScene = (line: string) => `scene start\n${line}\nend\n`;

let reread = 0;

let highlighter: Promise<(line: string) => number> | undefined;

const vscodeHighlighter = () => (highlighter ??= loadVscodeHighlighter());

const loadVscodeHighlighter = async () => {
  await tokenize("scene start\n  A {b} c\nend\n");
  const text = readFileSync(VSCODE_GRAMMAR, "utf8");
  const scopeName = JSON.parse(text).scopeName;
  const registry = new vstm.Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (patterns: string[]) => new onig.OnigScanner(patterns),
      createOnigString: (s: string) => {
        reread += s.length;
        return new onig.OnigString(s);
      },
    }),
    loadGrammar: async (requested: string) =>
      requested === scopeName
        ? vstm.parseRawGrammar(text, VSCODE_GRAMMAR)
        : requested === LUAU_FILE_SCOPE_NAME
          ? vstm.parseRawGrammar(readFileSync(LUAU_FILE_GRAMMAR, "utf8"), LUAU_FILE_GRAMMAR)
          : null,
  });
  const loaded = (await registry.loadGrammar(scopeName))!;
  const sceneStack = loaded.tokenizeLine("scene start", vstm.INITIAL).ruleStack;
  return (line: string) => {
    reread = 0;
    loaded.tokenizeLine(line, sceneStack);
    return reread;
  };
};

const NON_ASCII_SCAN = "[^\\x00-\\x7f]";

const scannedForNonAscii = (read: () => unknown) => {
  const test = RegExp.prototype.test;
  let scanned = 0;
  RegExp.prototype.test = function (this: RegExp, text: string) {
    if (this.source === NON_ASCII_SCAN) scanned += text.length;
    return test.call(this, text);
  };
  try {
    read();
  } finally {
    RegExp.prototype.test = test;
  }
  return scanned;
};

const RULE_SEARCHES: [string, string][] = [
  ["LuauFunctionDeclarationName", grammar.repository.LuauFunctionDeclarationName.match],
  ["LuauAccessPath's end", grammar.repository.LuauAccessPath.end],
];

describe("a line of unclosed braces is read in time linear in its length (#2306)", () => {
  test.each(PLACES)("%s of 2,000 unclosed braces, in the tree parser, takes less than four times the same line with each brace closed", (_where, source) => {
    parseSource("scene start\n  A {b} {b\nend\n");
    const closed = fastest(() => parseSource(source(" {b}")));
    const unclosed = fastest(() => parseSource(source(" {b")));
    expect(unclosed, `closed took ${closed.toFixed(1)}ms, unclosed took ${unclosed.toFixed(1)}ms`).toBeLessThan(4 * closed + 40);
  });

  test.each(RULE_SEARCHES)(
    "%s, searched as vscode-textmate searches it from every name on a line of 2,000 unclosed braces, never reads back to the line start",
    async (_rule, source) => {
      await tokenize("scene start\n  A {b} c\nend\n");
      const scanner = new onig.OnigScanner([source]);
      scanner.findNextMatchSync(new onig.OnigString("  A {b {b\n"), 0);
      const line = `  A${" {b".repeat(BRACES)}\n`;
      const ms = fastest(() => {
        const text = new onig.OnigString(line);
        for (let at = line.indexOf("b"); at < line.length; at += 3) {
          scanner.findNextMatchSync(text, at);
        }
      });
      expect(ms, `took ${ms.toFixed(1)}ms`).toBeLessThan(40);
    },
  );

  test("the tree parser counts each node it emits in time that does not grow with the rules open around it", () => {
    const counted = (open: number) => {
      const stack = new CompileStack();
      for (let i = 0; i < open; i++) {
        stack.push(i, i, 0);
        stack.increment();
      }
      const ms = fastest(() => {
        for (let k = 0; k < 20000; k++) {
          stack.increment();
        }
      });
      return { stack, ms };
    };
    const few = counted(2);
    const many = counted(BRACES);
    const emitted = BRACES + 3 * 20000;
    expect(many.stack.childCount(0), "the outermost entry counts every node emitted inside it").toBe(emitted);
    expect(many.stack.childCount(BRACES - 1), "the innermost entry counts the nodes emitted since it opened").toBe(1 + 3 * 20000);
    expect(many.stack.pop()[2], "a closed entry carries its count").toBe(1 + 3 * 20000);
    expect(new CompileStack(many.stack).childCount(0), "a copied stack keeps its counts").toBe(emitted);
    expect(many.ms, `2 open took ${few.ms.toFixed(2)}ms, ${BRACES} open took ${many.ms.toFixed(2)}ms`).toBeLessThan(4 * few.ms + 5);
  });

  test("the tree parser checks a rule for recursion in time that does not grow with the rules open before it", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const checked = (open: number) => {
        const state = new GrammarState("");
        for (let i = 0; i < open; i++) {
          state.enter("rule", i, true);
        }
        const ms = fastest(() => {
          for (let k = 0; k < 20000; k++) {
            state.possibleStackOverflow("rule", open);
          }
        });
        return { state, ms };
      };
      const few = checked(2);
      const many = checked(BRACES);
      expect(many.state.possibleStackOverflow("rule", BRACES), "a rule not yet tried at a position is allowed").toBe(false);
      many.state.enter("rule", BRACES);
      many.state.enter("other", BRACES);
      expect(many.state.possibleStackOverflow("rule", BRACES), "a rule tried again at the position it is already open at is refused").toBe(true);
      expect(many.ms, `2 open took ${few.ms.toFixed(2)}ms, ${BRACES} open took ${many.ms.toFixed(2)}ms`).toBeLessThan(4 * few.ms + 5);
    } finally {
      warn.mockRestore();
    }
  });
});

describe("a long line is read in time linear in its length (#2306)", () => {
  test.each(LONG_LINES)("%s, in VS Code's highlighter, re-reads at most the line's length again", async (_line, line) => {
    const highlight = await vscodeHighlighter();
    const text = line(BRACES);
    expect(highlight(text)).toBeLessThan(2 * text.length);
  });

  test.each(LONG_LINES)(
    "%s, in VS Code's highlighter, takes less than six times as long with 2,000 items as with 500",
    async (_line, line) => {
      const highlight = await vscodeHighlighter();
      highlight(line(FEW));
      const few = fastest(() => highlight(line(FEW)));
      const many = fastest(() => highlight(line(BRACES)));
      expect(many, `${FEW} took ${few.toFixed(1)}ms, ${BRACES} took ${many.toFixed(1)}ms`).toBeLessThan(6 * few + 20);
    },
    60000,
  );

  test.each(LONG_LINES)("%s, in the tree parser, is scanned for non-ASCII text at most a few times over", (_line, line) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const source = inScene(line(BRACES));
      parseSource(source);
      expect(scannedForNonAscii(() => parseSource(source))).toBeLessThan(4 * source.length);
    } finally {
      warn.mockRestore();
    }
  });

  test.each(LONG_LINES)(
    "%s, in the tree parser, takes less than six times as long with 2,000 items as with 500",
    (_line, line) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        parseSource(inScene(line(FEW)));
        const few = fastest(() => parseSource(inScene(line(FEW))));
        const many = fastest(() => parseSource(inScene(line(BRACES))));
        expect(many, `${FEW} took ${few.toFixed(1)}ms, ${BRACES} took ${many.toFixed(1)}ms`).toBeLessThan(6 * few + 20);
      } finally {
        warn.mockRestore();
      }
    },
    60000,
  );
});
