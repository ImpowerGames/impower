// The Luau corpus gate (#1908): every vendored upstream Luau snippet
// (`luauCorpus.ts`), placed in a function in a `.sd` document, must
//
// - leave no `ERROR_INCOMPLETE` node in its function: since the tiling
//   catch-all (#1905) a pure-Luau body reads every token, so a rule that
//   stops mid-content is a grammar defect;
// - end the function at its own `end`, when Luau's parser accepts the
//   snippet: a body that closes early hands the rest of the snippet to the
//   story, and one that runs past its `end` takes in what follows;
// - agree with Luau's parser on whether the snippet has a syntax error. A
//   conformance file's agreement is `luauSyntaxAgreement.test.ts`'s, which the
//   gate's CI job runs beside this file.
//
// What the gate finds on `main` is a Bug, filed under #1890 and listed with
// its number in `KNOWN_CORPUS_FAILURES`. A listed input must still fail, so
// the entry goes in the pull request that fixes it.

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
  type CorpusCheck,
  type CorpusInput,
  type CorpusSource,
} from "./luauCorpus";
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

const INPUTS = corpusInputs(ports);
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
    expect(failed, `${input.name} now passes the ${check} check. Remove its entry (#${entry.issue}) from KNOWN_CORPUS_FAILURES.\n${report}`).toBe(true);
  } else {
    expect(failed, `${input.name} fails the ${check} check. Fix it, or file a Bug under #1890 and list it in KNOWN_CORPUS_FAILURES.\n${report}`).toBe(false);
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
  });

  for (const input of INPUTS) {
    test(input.name, () => {
      const tree = parser.parse(input.text);
      const luau = officialSyntaxErrors(input.luau).map((error) => `fixture line ${error.location.begin.line}:${error.location.begin.column} ${error.message}`);

      const fn = snippetFunction(input, tree);
      expect(fn, typeof fn === "string" ? fn : "").not.toBeTypeOf("string");
      if (typeof fn === "string") return;

      const incomplete = incompleteNodes(input, fn);
      expectGate(input, "incomplete", incomplete.length > 0, `ERROR_INCOMPLETE at\n  ${incomplete.join("\n  ")}`);

      if (luau.length === 0) {
        expectGate(
          input,
          "extent",
          fn.to !== input.functionEnd,
          `the function ends at ${where(input, fn.to)}; its own \`end\` ends at ${where(input, input.functionEnd)}`,
        );
      }

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
