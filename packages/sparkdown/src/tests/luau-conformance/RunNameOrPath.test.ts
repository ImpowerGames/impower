// A `run` operand's two forms (#1389): an unquoted operand is a name, the one
// `.luau` file of that name anywhere in the project, and a quoted one is a
// path relative to the script, `.luau` implied. Both are case exact, and an
// operand that differs from a file only by case says the file's spelling
// (#1334).

import { describe, expect, test } from "vitest";
import { testCompiler, testStory } from "../engineUnderTest";

const MAIN = "inmemory:///main.sd";

/** Compiles main.sd with `files` by their paths in the project: URIs spelled
 *  as the web editor writes file names when `uriPathsAsWritten`, and
 *  otherwise as the paths are given. */
function compileProject(files: Record<string, string>, uriPathsAsWritten?: boolean) {
  const compiler = testCompiler();
  compiler.configure({
    uriPathsAsWritten,
    files: Object.entries(files).map(([path, text]) => {
      const uri = `inmemory:///${path}`;
      const file = uri.split("/").pop()!;
      return {
        uri,
        type: "script",
        name: file.split(".")[0]!,
        ext: file.slice(file.lastIndexOf(".") + 1),
        text,
        version: 1,
        languageId: file.endsWith(".luau") ? "luau" : "sparkdown",
      };
    }) as never,
  });
  const result = compiler.compile({ textDocument: { uri: MAIN } });
  // Errors and warnings; an error's statement leaves hints behind it.
  const diagnostics = (uri: string) =>
    (result.program.diagnostics?.[uri] ?? []).filter((d) => d.severity! <= 2).map((d) => ({
      message: typeof d.message === "string" ? d.message : d.message.value,
      severity: d.severity,
      range: d.range,
    }));
  const errors = Object.values(result.program.diagnostics ?? {})
    .flat()
    .filter((d) => d.severity === 1)
    .map((d) => (typeof d.message === "string" ? d.message : d.message.value));
  return { result, diagnostics, errors };
}

function recorded(chunks: unknown) {
  const story = testStory(chunks as never);
  story.stepLimit = 20000;
  const values: unknown[] = [];
  story.BindExternalFunction("harness_record", (v: unknown) => {
    values.push(v);
    return v;
  });
  story.ContinueMaximally();
  return values;
}

/** main.sd running `operand` from the first line of its start scene. */
const mainRunning = (operand: string) =>
  `external harness_record(v)\nscene start\n  run ${operand}\n  done\nend\n`;

/** The range of `operand` on main's third line. */
const operandRange = (operand: string) => ({
  start: { line: 2, character: 6 },
  end: { line: 2, character: 6 + operand.length },
});

describe("run by name", () => {
  test.each(["helpers", "helpers.luau"])(
    "runs the one helpers.luau in the project wherever it lives: run %s",
    (operand) => {
      const { result, errors } = compileProject({
        "main.sd": mainRunning(operand),
        "scripts/lib/helpers.luau": "harness_record(42)\n",
      });
      expect(errors).toEqual([]);
      expect(recorded(result.program.chunks)).toEqual([42]);
    },
  );

  test("finds a file by its name before the first dot", () => {
    const { result, errors } = compileProject({
      "main.sd": mainRunning("helpers"),
      "lib/helpers.v2.luau": "harness_record(2)\n",
    });
    expect(errors).toEqual([]);
    expect(recorded(result.program.chunks)).toEqual([2]);
  });

  test("reports every candidate of a shared name, and warns on each file", () => {
    const { result, diagnostics, errors } = compileProject({
      "main.sd": mainRunning("helpers"),
      "scripts/helpers.luau": "harness_record(1)\n",
      "lib/helpers.luau": "harness_record(2)\n",
    });
    expect(diagnostics(MAIN)).toEqual([
      {
        message:
          "More than one Luau file in the project is named 'helpers': 'lib/helpers.luau' and 'scripts/helpers.luau'. Quote the path of the one to run.",
        severity: 1,
        range: operandRange("helpers"),
      },
    ]);
    expect(errors).toHaveLength(1);
    for (const [file, other] of [
      ["lib/helpers.luau", "scripts/helpers.luau"],
      ["scripts/helpers.luau", "lib/helpers.luau"],
    ]) {
      const warnings = (result.program.diagnostics?.[`inmemory:///${file}`] ?? []).filter(
        (d) => d.severity === 2,
      );
      expect(warnings).toHaveLength(1);
      expect(warnings[0]!.relatedInformation?.[0]?.location.uri).toBe(
        `inmemory:///${other}`,
      );
    }
    expect(recorded(result.program.chunks)).toEqual([]);
  });

  test("leaves out files outside the project", () => {
    const { result, errors } = compileProject({
      "main.sd": mainRunning("helpers"),
      "lib/helpers.luau": "harness_record(1)\n",
      "other/main.sd": "scene start\n  done\nend\n",
      "other/helpers.luau": "harness_record(2)\n",
      ".hidden/helpers.luau": "harness_record(3)\n",
      "node_modules/helpers.luau": "harness_record(4)\n",
    });
    expect(errors).toEqual([]);
    expect(recorded(result.program.chunks)).toEqual([1]);
  });

  test("reports a name no file has", () => {
    const { diagnostics } = compileProject({
      "main.sd": mainRunning("missing"),
      "lib/helpers.luau": "harness_record(1)\n",
    });
    expect(diagnostics(MAIN)).toEqual([
      {
        message: "Could not find a Luau file named 'missing' in the project.",
        severity: 1,
        range: operandRange("missing"),
      },
    ]);
  });

  test.each([
    ["Helpers", "'helpers'"],
    ["helpers.LUAU", "'helpers'"],
  ])("says the spelling of a name that differs only by case: run %s", (operand, meant) => {
    const { result, diagnostics } = compileProject({
      "main.sd": mainRunning(operand),
      "lib/helpers.luau": "harness_record(1)\n",
    });
    expect(diagnostics(MAIN)).toEqual([
      {
        message: `Could not find a Luau file named '${operand}' in the project. Did you mean ${meant}?`,
        severity: 1,
        range: operandRange(operand),
      },
    ]);
    expect(recorded(result.program.chunks)).toEqual([]);
  });

  test("lists every name that differs only by case", () => {
    const { diagnostics } = compileProject({
      "main.sd": mainRunning("Helpers"),
      "a/helpers.luau": "harness_record(1)\n",
      "b/HELPERS.luau": "harness_record(2)\n",
    });
    expect(diagnostics(MAIN).map((d) => d.message)).toEqual([
      "Could not find a Luau file named 'Helpers' in the project. Did you mean 'helpers' or 'HELPERS'?",
    ]);
  });

  // Round 1 of PR #2124's review: an ambiguous name's fixes are the
  // candidates' paths relative to the script the run is in, which is not
  // main.sd's folder when the run is in a scene of another script, and they
  // travel as data, so a path with an apostrophe in it comes through whole.
  test("offers each candidate's path relative to the script the run is in", () => {
    const CHAPTER = "inmemory:///chapters/chapter.sd";
    const { result, errors } = compileProject({
      "main.sd": "scene start\n  -> chapter\nend\n",
      "chapters/chapter.sd": "scene chapter\n  run util\n  done\nend\n",
      "lib/O'Brien/util.luau": "harness_record(1)\n",
      "scripts/util.luau": "harness_record(2)\n",
    });
    expect(errors).toEqual([
      "More than one Luau file in the project is named 'util': 'lib/O'Brien/util.luau' and 'scripts/util.luau'. Quote the path of the one to run.",
    ]);
    const [diagnostic] = (result.program.diagnostics?.[CHAPTER] ?? []).filter(
      (d) => d.severity === 1,
    );
    expect(diagnostic!.range).toEqual({
      start: { line: 1, character: 6 },
      end: { line: 1, character: 10 },
    });
    expect(diagnostic!.data).toEqual({
      runFixes: [
        { title: `Use "../lib/O'Brien/util"`, newText: `"../lib/O'Brien/util"` },
        { title: 'Use "../scripts/util"', newText: '"../scripts/util"' },
      ],
    });
    // Each fix's path resolves from the chapter.
    for (const fix of diagnostic!.data.runFixes) {
      const fixed = compileProject({
        "main.sd": "scene start\n  -> chapter\nend\n",
        "chapters/chapter.sd": `scene chapter\n  run ${fix.newText}\n  done\nend\n`,
        "lib/O'Brien/util.luau": "harness_record(1)\n",
        "scripts/util.luau": "harness_record(2)\n",
      });
      expect(fixed.errors).toEqual([]);
    }
  });

  // Round 1 of PR #2124's review: a candidate in a folder whose name holds a
  // space is offered by its path as the author writes it, and that path
  // runs it, in the web editor, which spells URIs as file names are written,
  // and in VS Code, which percent-encodes them.
  // Round 2: and a folder whose name holds a character a URI reserves (`#`)
  // or what reads as an escape (`%20` written as such) comes through too.
  test.each([
    ["the web editor", "lib space/helpers.luau", true, "lib space"],
    ["VS Code", "lib%20space/helpers.luau", false, "lib space"],
    ["the web editor", "lib#one/helpers.luau", true, "lib#one"],
    ["VS Code", "lib%23one/helpers.luau", false, "lib#one"],
    ["the web editor", "lib%20space/helpers.luau", true, "lib%20space"],
    ["VS Code", "lib%2520space/helpers.luau", false, "lib%20space"],
  ])("offers and runs a candidate whose folder is unusual in %s: %s", (_, path, asWritten, folder) => {
    const files = {
      [path]: "harness_record(1)\n",
      "scripts/helpers.luau": "harness_record(2)\n",
    };
    const ambiguous = compileProject(
      { "main.sd": mainRunning("helpers"), ...files },
      asWritten,
    );
    expect(ambiguous.errors).toEqual([
      `More than one Luau file in the project is named 'helpers': '${folder}/helpers.luau' and 'scripts/helpers.luau'. Quote the path of the one to run.`,
    ]);
    const [error] = (ambiguous.result.program.diagnostics?.[MAIN] ?? []).filter(
      (d) => d.severity === 1,
    );
    expect(error!.data.runFixes[0]).toEqual({
      title: `Use "${folder}/helpers"`,
      newText: `"${folder}/helpers"`,
    });
    const { result, errors } = compileProject(
      { "main.sd": mainRunning(`"${folder}/helpers"`), ...files },
      asWritten,
    );
    expect(errors).toEqual([]);
    expect(recorded(result.program.chunks)).toEqual([1]);
  });

  // Round 1 of PR #2124's review: a quote the line never closes is read as
  // part of an unquoted operand, and is reported as the missing quote it is.
  test.each([`"./lib/helpers`, `'helpers`])(
    "reports a quote the line never closes: run %s",
    (operand) => {
      const { result, diagnostics } = compileProject({
        "main.sd": mainRunning(operand),
        "lib/helpers.luau": "harness_record(1)\n",
      });
      expect(diagnostics(MAIN)).toEqual([
        {
          message: `Close the quote: run ${operand}${operand[0]}`,
          severity: 1,
          range: operandRange(operand),
        },
      ]);
      expect(recorded(result.program.chunks)).toEqual([]);
    },
  );

  test("reports an unquoted path and asks for its quotes", () => {
    const { result, diagnostics } = compileProject({
      "main.sd": mainRunning("scripts/start"),
      "scripts/start.luau": "harness_record(1)\n",
    });
    expect(diagnostics(MAIN)).toEqual([
      {
        message: 'Quote a path: run "scripts/start"',
        severity: 1,
        range: operandRange("scripts/start"),
      },
    ]);
    expect(recorded(result.program.chunks)).toEqual([]);
  });
});

describe("run by quoted path", () => {
  test.each(['"./lib/helpers"', '"lib/helpers"', "'lib/helpers.luau'"])(
    "resolves relative to the script: run %s",
    (operand) => {
      const { result, errors } = compileProject({
        "main.sd": mainRunning(operand),
        "lib/helpers.luau": "harness_record(1)\n",
        "scripts/helpers.luau": "harness_record(2)\n",
      });
      expect(errors).toEqual([]);
      expect(recorded(result.program.chunks)).toEqual([1]);
    },
  );

  test.each([
    ['"Helpers"', "Helpers.luau", "helpers.luau"],
    ['"helpers.LUAU"', "helpers.LUAU", "helpers.luau"],
    ['"./Lib/helpers"', "./Lib/helpers.luau", "./lib/helpers.luau"],
  ])(
    "says the spelling of a path that differs only by case: run %s",
    (operand, written, meant) => {
      const files: Record<string, string> = {
        "main.sd": mainRunning(operand),
        "helpers.luau": "harness_record(1)\n",
        "lib/helpers.luau": "harness_record(2)\n",
      };
      const { result, diagnostics } = compileProject(files);
      expect(diagnostics(MAIN)).toEqual([
        {
          message: `Could not find '${written}' for 'run' statement. Did you mean '${meant}'?`,
          severity: 1,
          range: operandRange(operand),
        },
      ]);
      expect(recorded(result.program.chunks)).toEqual([]);
    },
  );

  // Round 2 of PR #2124's review: a quoted path may name a file in a folder
  // that holds a main script of its own, and its case-only near miss is
  // found there too.
  test("says the spelling of a path into another project", () => {
    const files = {
      "other/main.sd": "scene start\n  done\nend\n",
      "other/helpers.luau": "harness_record(1)\n",
    };
    const { result, diagnostics } = compileProject({
      "main.sd": mainRunning('"other/Helpers"'),
      ...files,
    });
    expect(diagnostics(MAIN).map((d) => d.message)).toEqual([
      "Could not find 'other/Helpers.luau' for 'run' statement. Did you mean 'other/helpers.luau'?",
    ]);
    const [error] = (result.program.diagnostics?.[MAIN] ?? []).filter((d) => d.severity === 1);
    expect(error!.data).toEqual({
      runFixes: [{ title: "Change to 'other/helpers'", newText: '"other/helpers"' }],
    });
    const fixed = compileProject({ "main.sd": mainRunning('"other/helpers"'), ...files });
    expect(fixed.errors).toEqual([]);
    expect(recorded(fixed.result.program.chunks)).toEqual([1]);
  });

  test("lists every path that differs only by case", () => {
    const { diagnostics } = compileProject({
      "main.sd": mainRunning('"Helpers"'),
      "helpers.luau": "harness_record(1)\n",
      "HELPERS.luau": "harness_record(2)\n",
    });
    expect(diagnostics(MAIN).map((d) => d.message)).toEqual([
      "Could not find 'Helpers.luau' for 'run' statement. Did you mean 'HELPERS.luau' or 'helpers.luau'?",
    ]);
  });

  test("reports a path no file has, with no suggestion", () => {
    const { diagnostics } = compileProject({
      "main.sd": mainRunning('"missing"'),
      "helpers.luau": "harness_record(1)\n",
    });
    expect(diagnostics(MAIN).map((d) => d.message)).toEqual([
      "Could not find 'missing.luau' for 'run' statement.",
    ]);
  });
});
