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
const MULTI_SCENE = `scene start
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

const PRODUCERS: Record<string, [body: string, lines: number[]]> = {
  "a tagged line": [
    `  The bell rings. # ominous\n  HERO: Goodbye. # final`,
    [5, 6, 7, 11, 12],
  ],
  "a write with no layer": [`  @: Layerless line.`, [5, 6, 10, 11]],
  "an empty body": [`  $:\n  After the heading.`, [5, 6, 7, 11, 12]],
  "a load line": [
    `  load overworld\n  The world appears.`,
    [5, 6, 7, 11, 12],
  ],
  "a mid-line divert": [`  We hurried home to -> later`, [5, 6, 10, 11]],
  "a mid-line load divert": [
    `  We hurried home to -> load later`,
    [5, 6, 10, 11],
  ],
  "an asset line": [
    `  [[show backdrop BG]]\n  After the asset.`,
    [5, 6, 7, 11, 12],
  ],
  "a load arrow": [`  -> load later`, [5, 6, 10, 11]],
  "a single-line alternator": [
    `  queue | A # t | B end\n  After the alternator.`,
    [5, 6, 7, 11, 12],
  ],
  "a bare {expr} line and a chain": [
    `  {1 + 2}\n  {1}{2}\n  After the expressions.`,
    [5, 6, 7, 8, 12, 13],
  ],
  "a print() call": [`  & f()\n  After the print.`, [5, 6, 7, 11, 12]],
  "picked choices": [
    `  choose\n    * Take it # picked\n    * Leave it -> later\n  end`,
    [6, 7, 9, 13, 14],
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

  test("a glued chain covers its source lines", () => {
    expect(coveredLines(GLUED)).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 14]);
  });

  test("each display line type covers its source line", () => {
    expect(coveredLines(FIXTURE)).toEqual([
      5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);
  });

  test("multi-scene line offsets are preserved", () => {
    expect(coveredLines(MULTI_SCENE)).toEqual([1, 2, 5, 6]);
  });
});
