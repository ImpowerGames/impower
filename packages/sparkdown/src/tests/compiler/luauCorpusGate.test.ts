// The Luau corpus gate (#1908): every vendored upstream Luau snippet
// (`luauCorpus.ts`), placed in a function in a `.sd` document, must
//
// - leave no `ERROR_INCOMPLETE` node in its function: since the tiling
//   catch-all (#1905) a pure-Luau body reads every token, so a rule that
//   stops mid-content is a grammar defect;
// - end the function where Luau's parser ends it: at its own `end`, or at the
//   end of the input when Luau reports that the snippet left the function
//   open (`Expected 'end' (to close 'function' at line 1), got <eof>`). A
//   body that closes early hands the rest of the snippet to the story, and
//   one that runs past its `end` takes in what follows;
// - agree with Luau's parser on whether the snippet has a syntax error. A
//   conformance file's agreement is `luauSyntaxAgreement.test.ts`'s, which the
//   gate's CI job runs beside this file.
//
// What the gate finds on `main` is a Bug, filed under #1890 and listed with
// its number in `KNOWN_CORPUS_FAILURES`, or a documented divergence listed
// with its section. A listed input must still fail, so the entry goes in the
// pull request that fixes it. The linter and autocomplete ports are read by
// running them (`luauPortCapture.ts`); a harness call the run never reached
// fails the gate.

import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test, vi } from "vitest";
import type { SyntaxNode, Tree } from "@lezer/common";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { PortedCase } from "../luau-conformance/typecheck/portedCases";
import { officialSyntaxErrors } from "./officialSyntax";
import {
  CORPUS_INVENTORY,
  corpusInputs,
  KNOWN_CORPUS_FAILURES,
  placeSnippet,
  type CorpusCheck,
  type CorpusInput,
  type CorpusSource,
} from "./luauCorpus";
import { captureLintPort, capturePortSnippets } from "./luauPortCapture";
import { readings } from "./luauSyntaxReadings";

// The type-checker port files hand their cases to `portUpstreamFile` as they
// load. Here it keeps them instead of registering their tests.
const ports = vi.hoisted(() => new Map<string, PortedCase[]>());
vi.mock("../luau-conformance/typecheck/portedCases", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../luau-conformance/typecheck/portedCases")>()),
  portUpstreamFile: (file: string, cases: PortedCase[]) => {
    ports.set(file, cases);
  },
}));
const PORTS = join(dirname(fileURLToPath(import.meta.url)), "..", "luau-conformance", "typecheck");
for (const file of readdirSync(PORTS).filter((f) => /^TypeInfer.*\.test\.ts$/.test(f)).sort()) {
  await import(`../luau-conformance/typecheck/${file}`);
}

const capture = await capturePortSnippets();
const INPUTS = corpusInputs(ports, capture.snippets);
// Luau reached the end of the input inside something still open, which the
// wrapper's `function` encloses, so the function was left open too.
const LEFT_OPEN = /, got <eof>/;
// Luau closed the function before the wrapper's `end`, which it then reports.
const CLOSED_EARLY = /^Expected <eof>, got 'end'/;

type OfficialError = ReturnType<typeof officialSyntaxErrors>[number];

const END_KEYWORD = /\bend\b/g;

/**
 * Where Luau's parser ends the snippet's function, as an offset in the
 * document.
 * - Luau reports the wrapper's `end` as surplus: it closed the function at an
 *   earlier `end`. That is the first `end` at which the Luau, cut off just
 *   after it, leaves nothing open at the end of the input.
 * - A Luau error ends `, got <eof>`: something was still open there, inside
 *   the function, so the function runs to the end of the input.
 * - Otherwise the function ends at its own `end`.
 */
function luauExtent(input: CorpusInput, errors: OfficialError[]): { end: number; says: string } {
  if (errors.some((error) => CLOSED_EARLY.test(error.message))) {
    for (const match of input.luau.matchAll(END_KEYWORD)) {
      if (match.index < input.luauSnippetStart) continue;
      const close = match.index + "end".length;
      if (officialSyntaxErrors(input.luau.slice(0, close)).some((error) => LEFT_OPEN.test(error.message))) continue;
      const end = input.snippetStart + (close - input.luauSnippetStart);
      return { end, says: `at the \`end\` that closes it before the surplus one, ${where(input, end)}` };
    }
    throw new Error(`${input.name}: Luau reports a surplus \`end\`, but no earlier \`end\` closes the function`);
  }
  if (errors.some((error) => LEFT_OPEN.test(error.message))) {
    return { end: input.text.length, says: "at the end of the input, left open" };
  }
  return { end: input.functionEnd, says: `at its own \`end\`, ${where(input, input.functionEnd)}` };
}
const known = new Map(KNOWN_CORPUS_FAILURES.map((entry) => [`${entry.input} ${entry.check}`, entry]));
const compiler = new SparkdownCompiler();
compiler.configure({ files: [] } as never);
const parser = compiler.documents.parser;

/** An offset in the input as `line:character` (0-based), with the text of its line. */
function where(input: CorpusInput, offset: number): string {
  const start = input.text.lastIndexOf("\n", offset - 1) + 1;
  const end = input.text.indexOf("\n", offset);
  const line = input.text.slice(0, start).split("\n").length - 1;
  return `${line}:${offset - start} ${JSON.stringify(input.text.slice(start, end < 0 ? undefined : end))}`;
}

/**
 * The function that holds the snippet: the top-level node that begins where
 * the input's function does, or why there is none.
 */
function snippetFunction(input: CorpusInput, tree: Tree): SyntaxNode | string {
  let node: SyntaxNode | null = tree.topNode.firstChild;
  while (node && node.to <= input.functionStart) node = node.nextSibling;
  if (!node || node.from !== input.functionStart || node.name !== "LuauFunctionDefinition") {
    return `no function begins at ${where(input, input.functionStart)}: found ${node?.name ?? "nothing"}`;
  }
  return node;
}

/**
 * The `ERROR_INCOMPLETE` nodes inside the function, each where it starts.
 * Text after a function that closed early is story, not a Luau body; the
 * extent check reports the early close.
 */
function incompleteNodes(input: CorpusInput, fn: SyntaxNode): string[] {
  const found: string[] = [];
  const visit = (node: SyntaxNode): void => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.name === "ERROR_INCOMPLETE") found.push(where(input, child.from));
      visit(child);
    }
  };
  visit(fn);
  return [...new Set(found)];
}

/** Fails unless `failed` is false, or is true and listed. A listed check that passes fails too. */
function expectGate(input: CorpusInput, check: CorpusCheck, failed: boolean, report: string): void {
  const entry = known.get(`${input.name} ${check}`);
  if (entry) {
    const why = entry.issue ? `#${entry.issue}` : entry.divergence;
    expect(failed, `${input.name} now passes the ${check} check. Remove its entry (${why}) from KNOWN_CORPUS_FAILURES.\n${report}`).toBe(true);
  } else {
    expect(
      failed,
      `${input.name} fails the ${check} check. Fix it, or file a Bug under #1890 and list it in KNOWN_CORPUS_FAILURES (a documented divergence is listed with its section).\n${report}`,
    ).toBe(false);
  }
}

describe("Luau corpus gate", () => {
  test("reads the inventory of every source, and lists each known failure once, for an input that exists", () => {
    const counts = Object.fromEntries(
      (Object.keys(CORPUS_INVENTORY) as CorpusSource[]).map((source) => [source, INPUTS.filter((input) => input.source === source).length]),
    );
    expect(counts, "the corpus changed size; update CORPUS_INVENTORY with the change that caused it").toEqual(CORPUS_INVENTORY);
    const names = new Set(INPUTS.map((input) => input.name));
    expect(names.size, "every input has its own name").toBe(INPUTS.length);
    expect(KNOWN_CORPUS_FAILURES.filter((entry) => !names.has(entry.input)).map((entry) => entry.input)).toEqual([]);
    expect(known.size).toBe(KNOWN_CORPUS_FAILURES.length);
    expect(
      KNOWN_CORPUS_FAILURES.filter((entry) => !entry.issue === !entry.divergence).map((entry) => entry.input),
      "each entry names one Bug or one divergence",
    ).toEqual([]);
    expect(
      capture.unreached,
      "a port's harness call never ran, so its snippet is not in the corpus; make luauPortCapture.ts reach it",
    ).toEqual([]);
    expect(
      capture.aborted,
      "a port's test body threw while its snippets were read, so a later snippet may be missing; make luauPortCapture.ts run it through",
    ).toEqual([]);
  });

  // The second `describe` of upstream DeprecatedApiUntyped has no `// Luau:`
  // comment of its own; it continues the case above it (round 1 of #1996).
  test("reads a linter case's snippets from every group that continues it", () => {
    expect(
      INPUTS.filter((input) => input.name.startsWith("lint/LintExistingWarnings.test.ts/") && input.luau.includes("print(table.nogetn())")).length,
    ).toBe(1);
  });

  // A loop over rows that reads each row's result stops at a row it cannot
  // read; its later rows were never handed over, though the call site ran
  // (round 2 of #1996). The capture reports the stopped body.
  test("reports a port body that stops before its later snippets", async () => {
    const port = [
      `import { expect, test } from "vitest";`,
      `import { lintInFunction } from "./diagnosticTestHarness";`,
      `// Luau: RowsFixture`,
      `test("rows", () => {`,
      `  for (const body of ["return 1", "return 2"]) {`,
      `    const [first] = lintInFunction(body);`,
      `    expect(first!.line).toBe(0);`,
      `  }`,
      `});`,
    ].join("\n");
    const result = await captureLintPort("LintRowsFixture.test.ts", port);
    expect(result.snippets.map((snippet) => snippet.text)).toEqual(["return 1"]);
    expect(result.unreached).toEqual([]);
    expect(result.aborted).toHaveLength(1);
    expect(result.aborted[0]).toMatch(/^LintRowsFixture\.test\.ts: rows: /);
  });

  // Luau closes the function at the `end` of an unsupported `class` and then
  // reports the wrapper's `end` as surplus. The gate expects exactly that
  // `end`, so a function closing at any other point fails it.
  test("expects a function that Luau closes early to end at the `end` Luau closes it at", () => {
    const input = placeSnippet("surplus", "lint", "local a = 1\nclass A\n  x = 1\nend\nprint(a)");
    const errors = officialSyntaxErrors(input.luau);
    expect(errors.some((error) => CLOSED_EARLY.test(error.message))).toBe(true);
    const classEnd = input.text.indexOf("\nend\nprint(a)") + "\nend".length;
    expect(luauExtent(input, errors).end).toBe(classEnd);
    const fn = snippetFunction(input, parser.parse(input.text));
    expect(typeof fn === "string" ? fn : fn.to).toBe(classEnd);
  });

  for (const input of INPUTS) {
    test(input.name, () => {
      const tree = parser.parse(input.text);
      const errors = officialSyntaxErrors(input.luau);
      const luau = errors.map((error) => `fixture line ${error.location.begin.line}:${error.location.begin.column} ${error.message}`);

      const fn = snippetFunction(input, tree);
      expect(fn, typeof fn === "string" ? fn : "").not.toBeTypeOf("string");
      if (typeof fn === "string") return;

      const incomplete = incompleteNodes(input, fn);
      expectGate(input, "incomplete", incomplete.length > 0, `ERROR_INCOMPLETE at\n  ${incomplete.join("\n  ")}`);

      const extent = luauExtent(input, errors);
      expectGate(
        input,
        "extent",
        fn.to !== extent.end,
        `the function ends at ${where(input, fn.to)}; Luau ends it ${extent.says}${luau.length ? `\nLuau's parse errors:\n  ${luau.join("\n  ")}` : ""}`,
      );

      if (input.source !== "conformance") {
        const { sparkdown } = readings(input);
        const report = [
          `Sparkdown's syntax errors: ${sparkdown.length ? `\n  ${sparkdown.join("\n  ")}` : "none"}`,
          `Luau's parse errors: ${luau.length ? `\n  ${luau.join("\n  ")}` : "none"}`,
        ].join("\n");
        expectGate(input, "syntax", sparkdown.length > 0 !== luau.length > 0, report);
      }
    }, 120_000);
  }
});
