// A local of a standard-library name or namespace hides the library for the
// rest of its scope, as in Luau: a direct call of the name (`type(7)`) or of
// a member of the namespace (`math.abs(-3)`) written there calls the local's
// value, as a read of the name as a value already does (I-1372). A call
// written before the local, or with no local of the name, still calls the
// builtin. A script that replaces a namespace (`math = { ... }`) calls its
// own function, which no arity of the builtin's describes (I-1375).

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { ProgramStory } from "../../program/ProgramStory";
import { compileScript, errorsOf, programSession, storyBeats } from "../program/programHarness";
import { programListing } from "../programListing";

const quiet = <T>(run: () => T): T => {
  const { warn, error } = console;
  console.warn = console.error = () => {};
  try {
    return run();
  } finally {
    console.warn = warn;
    console.error = error;
  }
};

const shown = (root: ProgramRoot) => {
  const { beats, errors } = storyBeats(new ProgramStory(root));
  return { texts: beats.map((b) => b.text.trim()), errors };
};

const rootOf = (lines: string[]) =>
  quiet(() => {
    const { program } = compileScript([...lines, ""].join("\n"));
    expect(errorsOf(program)).toEqual([]);
    return program.chunks!;
  });

const run = (lines: string[]) => quiet(() => shown(rootOf(lines)));

const got = (...texts: string[]) => ({ texts, errors: [] });

describe("a top-level local of a stdlib name", () => {
  test.each([
    [
      "a function name",
      [
        "local type = function(v) return 'custom' end",
        "local f = type",
        "Got {f(7)} {type(7)}.",
      ],
      "Got custom custom.",
    ],
    [
      "a namespace",
      ["local math = { abs = function(v) return 77 end }", "Got {math.abs(-3)}."],
      "Got 77.",
    ],
    [
      "tostring",
      ["local tostring = function(v) return 'custom' end", "Got {tostring(7)}."],
      "Got custom.",
    ],
  ])("hides the library from a direct call written after it (%s)", (_, lines, expected) => {
    expect(run(lines)).toEqual(got(expected));
  });

  test("hides the library from a direct call in a function written after it", () => {
    expect(
      run([
        "local type = function(v) return 'custom' end",
        "local math = { abs = function(v) return 77 end }",
        "function g()",
        "  return type(7) .. ' ' .. math.abs(-3)",
        "end",
        "Got {g()}.",
      ]),
    ).toEqual(got("Got custom 77."));
  });

  test("leaves the builtin to a call written before it", () => {
    expect(
      run([
        "Before {type(7)} {math.abs(-3)}.",
        "local type = function(v) return 'custom' end",
        "local math = { abs = function(v) return 77 end }",
        "After {type(7)} {math.abs(-3)}.",
      ]),
    ).toEqual(got("Before number 3.", "After custom 77."));
  });

  test("hides the library from a direct call in a closure written after it", () => {
    expect(
      run([
        "local type = function(v) return 'custom' end",
        "local math = { abs = function(v) return 77 end }",
        "local c = function() return type(7) .. ' ' .. math.abs(-3) end",
        "Got {c()}.",
      ]),
    ).toEqual(got("Got custom 77."));
  });

  test("hides the library from the call shorthand written after it", () => {
    expect(
      run(["local type = function() return 'custom' end", "Got {{type}}."]),
    ).toEqual(got("Got custom."));
  });

  test("hides a library member named like a builtin method from a dot call", () => {
    expect(
      run([
        "local string = { upper = function(s) return 'mine' end }",
        "Got {string.upper('a')}.",
      ]),
    ).toEqual(got("Got mine."));
  });

  // A top-level block's later statements read its locals by name, as before
  // the root-local index (I-1468): a direct call there still reaches the
  // library.
  test("leaves the builtin to a direct call inside a top-level block", () => {
    expect(
      run([
        "if true then",
        "  local type = function(v) return 'custom' end",
        "  local f = type",
        "  Got {f(7)} {type(7)}.",
        "end",
      ]),
    ).toEqual(got("Got custom number."));
  });

  test("leaves the builtin to a function written before it", () => {
    expect(
      run([
        "function g()",
        "  return type(7) .. ' ' .. math.abs(-3)",
        "end",
        "local type = function(v) return 'custom' end",
        "local math = { abs = function(v) return 77 end }",
        "Got {g()}.",
      ]),
    ).toEqual(got("Got number 3."));
  });
});

describe("a function's local of a stdlib name", () => {
  test("hides the library from a direct call in its scope", () => {
    expect(
      run([
        "function g()",
        "  local before = type(7)",
        "  local type = function(v) return 'custom' end",
        "  local math = { abs = function(v) return 77 end }",
        "  return before .. ' ' .. type(7) .. ' ' .. math.abs(-3)",
        "end",
        "Got {g()}.",
      ]),
    ).toEqual(got("Got number custom 77."));
  });
});

describe("an incremental compile", () => {
  // The edits leave the calls' own lines as they were, so the chunks that
  // hold them are carried unless the `local` above them is asked again.
  const base = [
    "store n = 0",
    "Got {type(7)} {math.abs(-3)}.",
    "",
  ].join("\n");
  const locals = [
    "local type = function(v) return 'custom' end",
    "local math = { abs = function(v) return 77 end }",
  ].join("\n");

  const expectCold = (edits: [string, string][], expected: string[]) => {
    const session = programSession(base);
    let root = session.root;
    for (const [before, after] of edits) {
      root = session.edit(before, after);
    }
    const cold = run([session.text]);
    expect(quiet(() => shown(root))).toEqual(cold);
    expect(programListing(root)).toEqual(programListing(rootOf([session.text])));
    expect(cold.texts).toEqual(expected);
  };

  test("shows what a cold compile shows with locals of the names inserted above the calls", () => {
    expectCold([["store n = 0", `store n = 0\n${locals}`]], ["Got custom 77."]);
  });

  test("shows what a cold compile shows with the locals the calls read removed", () => {
    expectCold(
      [
        ["store n = 0", `store n = 0\n${locals}`],
        [`\n${locals}`, ""],
      ],
      ["Got number 3."],
    );
  });
});

function diagnosticsFor(source: string): string[] {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: "inmemory:///main.sd",
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const result = compiler.compile({
    textDocument: { uri: "inmemory:///main.sd" },
  });
  const out: string[] = [];
  for (const docDiagnostics of Object.values(result.program.diagnostics ?? {})) {
    for (const d of docDiagnostics) {
      const raw = (d as any).message;
      out.push(typeof raw === "string" ? raw : raw?.value ?? JSON.stringify(d));
    }
  }
  return out;
}

const arityWarnings = (lines: string[]) =>
  quiet(() => diagnosticsFor([...lines, ""].join("\n"))).filter((m) =>
    m.includes("should take"),
  );

describe("the arity of a stdlib namespace member's call", () => {
  test("is not the builtin's when the script replaces the namespace", () => {
    expect(
      arityWarnings([
        'math = { abs = function(a, b) return tostring(a) .. "/" .. tostring(b) end }',
        "function none()",
        "end",
        "Two literals give {math.abs(1, 2)}.",
        "Nothing then two gives {math.abs(none(), 2)}.",
      ]),
    ).toEqual([]);
  });

  test("is not the builtin's when a function replaces the namespace", () => {
    expect(
      arityWarnings([
        "function setup()",
        "  math = { abs = function(a, b) return a end }",
        "end",
        "& setup()",
        "Got {math.abs(1, 2)}.",
      ]),
    ).toEqual([]);
  });

  test("follows an edit that adds, then removes, the replacement", () => {
    const replacement = "math = { abs = function(a, b) return a end }\n";
    const session = programSession("store n = 0\nGot {math.abs(1, 2)}.\n");
    const warnings = () =>
      Object.values(session.program.diagnostics ?? {})
        .flat()
        .map((d) => (typeof d.message === "string" ? d.message : d.message.value))
        .filter((m) => m.includes("should take"));
    expect(warnings()).toEqual(["math.abs should take 1 parameter, got 2"]);
    session.edit("store n = 0\n", `store n = 0\n${replacement}`);
    expect(warnings()).toEqual([]);
    session.edit(replacement, "");
    expect(warnings()).toEqual(["math.abs should take 1 parameter, got 2"]);
  });

  test("is not the builtin's when a local hides the namespace", () => {
    expect(
      arityWarnings([
        "local math = { abs = function(a, b) return a end }",
        "Got {math.abs(1, 2)}.",
      ]),
    ).toEqual([]);
  });

  test("is the builtin's when nothing replaces it", () => {
    expect(arityWarnings(["Got {math.abs(1, 2)}."])).toEqual([
      "math.abs should take 1 parameter, got 2",
    ]);
  });

  test("is the builtin's when a call is written before a local of the namespace", () => {
    expect(
      arityWarnings([
        "Got {math.abs(1, 2)}.",
        "local math = { abs = function(a, b) return a end }",
      ]),
    ).toEqual(["math.abs should take 1 parameter, got 2"]);
  });
});

describe("a deprecated stdlib call", () => {
  const deprecations = (lines: string[]) =>
    quiet(() => diagnosticsFor([...lines, ""].join("\n"))).filter((m) =>
      m.includes("is deprecated"),
    );

  test("keeps its hint with no local of the name", () => {
    expect(deprecations(["Got {math.pow(2, 3)} {table.getn({1})}."])).toHaveLength(2);
  });

  test("keeps its hint when written before a local of the namespace", () => {
    expect(
      deprecations([
        "Got {math.pow(2, 3)}.",
        "local math = { pow = function(a, b) return 1 end }",
      ]),
    ).toHaveLength(1);
  });

  test("has none when a local hides the namespace", () => {
    expect(
      deprecations([
        "local math = { pow = function(a, b) return 1 end }",
        "Got {math.pow(2, 3)}.",
      ]),
    ).toEqual([]);
  });
});
