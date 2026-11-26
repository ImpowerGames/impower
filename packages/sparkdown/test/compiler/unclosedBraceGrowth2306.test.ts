import { CompileStack } from "@impower/textmate-grammar-tree/src/compiler/classes/CompileStack";
import { GrammarState } from "@impower/textmate-grammar-tree/src/grammar/classes/GrammarState";
import vstm from "vscode-textmate";
import { describe, expect, test, vi } from "vitest";
import { parseSource } from "./grammarSnapshot";
import { createRegistry } from "./vscodeGrammarSnapshot";

const BRACES = 2000;

const FEW = 500;

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
  ["a dotted path", (n) => `  A {${"b.".repeat(n)}b}`],
  ["joined strings", (n) => `  A {${'"x" .. '.repeat(n)}"x"}`],
  ["a method chain", (n) => `  A {a${":m()".repeat(n)}}`],
  ["an index chain", (n) => `  A {a${"[b]".repeat(n)}}`],
  ["table fields", (n) => `  A {{${"b = 1, ".repeat(n)}}}`],
  ["a local's sum", (n) => `  local x = b${" + b".repeat(n)}`],
  ["a local's call", (n) => `  local x = f(${"b, ".repeat(n)}b)`],
  ["if expressions", (n) => `  local x = ${"if a then b else ".repeat(n)}c`],
  ["action text", (n) => `  A${" word".repeat(n)}`],
  ["dialogue text", (n) => `  NARRATOR: ${"word ".repeat(n)}`],
];

const TEXT_LINES = LONG_LINES.filter(([name]) => name === "action text" || name === "dialogue text");

const inScene = (line: string) => `scene start\n${line}\nend\n`;

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

const quietly = <T>(read: () => T) => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    return read();
  } finally {
    warn.mockRestore();
  }
};

describe("the tree parser reads a long line in time linear in its length (#2306)", () => {
  test.each(PLACES)("%s of 2,000 unclosed braces takes less than four times the same line with each brace closed", (_where, source) => {
    parseSource("scene start\n  A {b} {b\nend\n");
    const closed = fastest(() => parseSource(source(" {b}")));
    const unclosed = fastest(() => parseSource(source(" {b")));
    expect(unclosed, `closed took ${closed.toFixed(1)}ms, unclosed took ${unclosed.toFixed(1)}ms`).toBeLessThan(4 * closed + 40);
  });

  test("it counts each node it emits in time that does not grow with the rules open around it", () => {
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

  test("it checks a rule for recursion in time that does not grow with the rules open before it", () => {
    quietly(() => {
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
    });
  });

  test.each(LONG_LINES)("%s is scanned for non-ASCII text at most a few times over", (_line, line) => {
    quietly(() => {
      const source = inScene(line(BRACES));
      parseSource(source);
      expect(scannedForNonAscii(() => parseSource(source))).toBeLessThan(4 * source.length);
    });
  });

  test.each(LONG_LINES)(
    "%s takes less than six times as long with 2,000 items as with 500",
    (_line, line) => {
      quietly(() => {
        parseSource(inScene(line(FEW)));
        const few = fastest(() => parseSource(inScene(line(FEW))));
        const many = fastest(() => parseSource(inScene(line(BRACES))));
        expect(many, `${FEW} took ${few.toFixed(1)}ms, ${BRACES} took ${many.toFixed(1)}ms`).toBeLessThan(6 * few + 20);
      });
    },
    60000,
  );
});

describe("VS Code's highlighter reads a long line of story text in time linear in its length (#2306)", () => {
  test.each(TEXT_LINES)(
    "%s takes less than six times as long with 2,000 words as with 500",
    async (_line, line) => {
      const { registry, scopeName } = await createRegistry();
      const highlighter = (await registry.loadGrammar(scopeName))!;
      const scene = highlighter.tokenizeLine("scene start", vstm.INITIAL).ruleStack;
      const highlight = (text: string) => highlighter.tokenizeLine(text, scene);
      highlight(line(FEW));
      const few = fastest(() => highlight(line(FEW)));
      const many = fastest(() => highlight(line(BRACES)));
      expect(many, `${FEW} took ${few.toFixed(1)}ms, ${BRACES} took ${many.toFixed(1)}ms`).toBeLessThan(6 * few + 20);
    },
    60000,
  );
});
