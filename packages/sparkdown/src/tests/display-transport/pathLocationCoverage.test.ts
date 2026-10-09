// The display() lowering's address COVERAGE. The screenplay preview's
// click-to-line routing needs every display line to resolve to an address
// that stands on that line (`ProgramRoot.addressAt`, `locationOf`), and no
// spurious extra lines. Each synthesized display() FunctionCall is stamped with
// its source range in `buildDisplayCall`. The expected SET of covered source
// lines (0-based) of each fixture is every line of story content a statement
// starts on: not a scene's header, an `end`, a blank line, a definition or a
// function's body, which no story starts at.

import { describe, expect, test, vi } from "vitest";
import { testCompiler } from "../engineUnderTest";

const URI = "inmemory:///main.sd";

function compile(source: string) {
  const compiler = testCompiler();
  compiler.configure({
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  return compiler.compile({ textDocument: { uri: URI } }).program;
}

function coveredLines(source: string): number[] {
  const root = compile(source).chunks;
  expect(root, "the compile built statement chunks").toBeDefined();
  return source.split("\n").flatMap((_text, line) => {
    const address = root!.addressAt(URI, line);
    return address !== undefined && root!.locationOf(address)?.startLine === line
      ? [line]
      : [];
  });
}

const FIXTURE = `define HERO as character with
  name = "HERO"
end

-> start

scene start
  The room is quiet.
  HERO: Hello there.
  You have {1 + 1} apples.
  This is **bold** text.
  ^: A Title
  $: INT. HOUSE - DAY
  %: CUT TO:
  HERO (sad): I feel {2 * 2}.
  HERO: First part. >
  Second part.
  The end.
end
`;

// A separate scene exercises cross-scene line offsets.
const MULTI_SCENE = `-> one

scene one
  First scene line.
  -> two

scene two
  Second scene line.
  Another line here.
end
`;

// Glued chains: every line lowers to its own stamped display() call.
const GLUED = `define HERO as character with
  name = "HERO"
end

-> start

scene start
  Some ..
  content ..
  with glue.
  HERO: Wait ..
  right there.
  You see a ..
  if true then
    red door.
  end
  The end.
end
`;

// One scene per producer, so a producer that loses or gains coverage shows up
// by its own line. Each maps to its body and its covered lines: the
// `-> start` divert (4), the body's lines from line 7, the `done` after the
// body, and `Savile Row.` and `done` in `later`.
const PRODUCERS: Record<string, [body: string, lines: number[]]> = {
  "a tagged line": [
    `  The bell rings. # ominous\n  HERO: Goodbye. # final`,
    [4, 7, 8, 9, 13, 14],
  ],
  "a write with no layer": [`  @: Layerless line.`, [4, 7, 8, 12, 13]],
  "an empty body": [`  $:\n  After the heading.`, [4, 7, 8, 9, 13, 14]],
  "a load line": [
    `  load overworld\n  The world appears.`,
    [4, 7, 8, 9, 13, 14],
  ],
  "a mid-line divert": [`  We hurried home to -> later`, [4, 7, 8, 12, 13]],
  "a mid-line load divert": [
    `  We hurried home to -> load later`,
    [4, 7, 8, 12, 13],
  ],
  "an asset line": [
    `  [[show backdrop BG]]\n  After the asset.`,
    [4, 7, 8, 9, 13, 14],
  ],
  "a load arrow": [`  -> load later`, [4, 7, 8, 12, 13]],
  // The alternator line (7) covers its own line with its statement (#944).
  "a single-line alternator": [
    `  queue | A # t | B end\n  After the alternator.`,
    [4, 7, 8, 9, 13, 14],
  ],
  "a bare {expr} line and a chain": [
    `  {1 + 2}\n  {1}{2}\n  After the expressions.`,
    [4, 7, 8, 9, 10, 14, 15],
  ],
  // The `& f()` logic line (7) covers its own line with its call (#824).
  "a print() call": [`  & f()\n  After the print.`, [4, 7, 8, 9, 13, 14]],
  // The `choose` line (7) and its `end` (10) start no beat: the menu's
  // choices (8, 9) do.
  "picked choices": [
    `  choose\n    * Take it # picked\n    * Leave it -> later\n  end`,
    [4, 8, 9, 11, 15, 16],
  ],
};

// Error diagnostics of a compile, so a fixture that does not compile cleanly
// cannot pass on a partial program. An error the compiler cannot place in the
// source (`getDiagnostic` drops a column below zero) is only logged, as
// `console.warn("HIDDEN", message, severity, ...)`, so the log is read too.
function compileErrors(source: string) {
  const hidden: string[] = [];
  const warn = vi.spyOn(console, "warn").mockImplementation((...args) => {
    if (args[0] === "HIDDEN" && args[2] === 1) hidden.push(String(args[1]));
  });
  try {
    return [...placedErrors(source), ...hidden];
  } finally {
    warn.mockRestore();
  }
}

function placedErrors(source: string) {
  return Object.values(compile(source).diagnostics ?? {})
    .flat()
    .filter((d: any) => d?.severity === 1)
    .map((d: any) => d.message);
}

function producerScene(body: string) {
  return `define HERO as character with
  name = "HERO"
end

-> start

scene start
${body}
  done
end

scene later
  Savile Row.
  done
end

function f()
print("hi")
end
`;
}

describe("address coverage", () => {
  for (const [label, [body, lines]] of Object.entries(PRODUCERS)) {
    test(`${label} covers its source lines`, () => {
      const source = producerScene(body);
      expect(compileErrors(source)).toEqual([]);
      expect(coveredLines(source)).toEqual(lines);
    });
  }

  // The `if true then` line (13) covers its own line with its statement (#944).
  test("a glued chain covers its source lines", () => {
    expect(coveredLines(GLUED)).toEqual([4, 7, 8, 9, 10, 11, 12, 13, 14, 16]);
  });

  test("each display line type covers its source line", () => {
    expect(coveredLines(FIXTURE)).toEqual([
      4, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
    ]);
  });

  test("multi-scene line offsets are preserved", () => {
    expect(coveredLines(MULTI_SCENE)).toEqual([0, 3, 4, 7, 8]);
  });
});
