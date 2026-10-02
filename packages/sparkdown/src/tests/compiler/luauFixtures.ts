// The Luau fixtures the oracles of #1283 read, found rather than listed, so a
// fixture added under either directory is read without editing a test:
// - the `.sd` grammar fixtures under `__snapshots__/grammar/luau-*/`, compiled
//   as they are. They mix Luau with Sparkdown's own syntax, so their Luau is
//   what the type checker extracts from the compiled tree;
// - the upstream conformance files under
//   `../luau-conformance/upstream/conformance/`, read and wrapped as the
//   conformance harness reads and wraps them (`applyUpstreamPatches`, then
//   `wrapConformanceSource`). The patches stand in for Sparkdown's documented
//   divergences from Luau, such as `"..."` interpolating (DIVERGENCES.md), and
//   for code that needs a runtime compiler. These files are Luau as written,
//   so Luau's parser reads the patched file itself, in the function the
//   harness wraps it in.
//
// `KNOWN_DISAGREEMENTS` names the inputs on which Sparkdown and Luau's parser
// disagree about whether there is a syntax error, each with the open issue
// that explains it (#1284). The oracles skip or expect them; the fix for an
// issue removes its entry in the fix's own pull request.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { wrapConformanceSource } from "../luau-conformance/conformanceTestHarness";
import { applyUpstreamPatches } from "../luau-conformance/upstreamPatches";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GRAMMAR_ROOT = join(__dirname, "__snapshots__", "grammar");
const CONFORMANCE_ROOT = join(__dirname, "..", "luau-conformance", "upstream", "conformance");

export interface KnownDisagreement {
  /** The input, as `luauInputs` names it: `grammar/<category>/<file>.sd` or `conformance/<file>.luau`. */
  fixture: string;
  /** The open issue that explains the disagreement. */
  issue: number;
  /** Which side reports a syntax error, and where. */
  reason: string;
}

export const KNOWN_DISAGREEMENTS: KnownDisagreement[] = [
  {
    fixture: "grammar/luau-declaration/repeat-local-before-until.sd",
    issue: 1304,
    reason: "Luau only: the prelude unit drops a top-level repeat loop's until clause, so the parser expects until",
  },
  {
    fixture: "grammar/luau-function/if-expression-glued-then.sd",
    issue: 1305,
    reason: "Sparkdown only: `@/x/githen` (line 23) is reported as missing its then",
  },
  {
    fixture: "grammar/luau-function/return-before-prose.sd",
    issue: 1298,
    reason: "Luau only: statements after `& return` in the scene follow a return in the flow's function",
  },
  {
    fixture: "conformance/integers.luau",
    issue: 1309,
    reason: "Sparkdown only: each integer literal (`123i`) is a malformed number",
  },
  {
    fixture: "conformance/integers_regspill.luau",
    issue: 1309,
    reason: "Sparkdown only: each integer literal (`1i`) is a malformed number",
  },
  {
    fixture: "conformance/native_integer_spills.luau",
    issue: 1306,
    reason: "Sparkdown only: `local x0, ..., x7 =` with its values on the next line",
  },
];

export interface LuauInput {
  name: string;
  /** The document Sparkdown compiles. */
  text: string;
  /** The Luau the document holds, when it is Luau as written; otherwise its Luau is the units the type checker extracts from the tree. */
  luau?: string;
}

// A conformance file's Luau as the harness runs it: the body of `run`, which
// takes no parameters, so a `...` in the file is Luau's error there as it is
// Sparkdown's. Line N of the file is line N of this text (0-based), after the
// `function run()` line.
export function conformanceLuau(source: string): string {
  return `function run()\n${source}\nend\n`;
}

/** Every Luau fixture, grammar fixtures first, each group in name order. */
export function luauInputs(): LuauInput[] {
  const found: LuauInput[] = [];
  for (const category of readdirSync(GRAMMAR_ROOT).filter((d) => d.startsWith("luau-")).sort()) {
    for (const file of readdirSync(join(GRAMMAR_ROOT, category)).filter((f) => f.endsWith(".sd")).sort()) {
      found.push({ name: `grammar/${category}/${file}`, text: readFileSync(join(GRAMMAR_ROOT, category, file), "utf8") });
    }
  }
  if (existsSync(CONFORMANCE_ROOT)) {
    for (const file of readdirSync(CONFORMANCE_ROOT).filter((f) => f.endsWith(".luau")).sort()) {
      const source = applyUpstreamPatches(file, readFileSync(join(CONFORMANCE_ROOT, file), "utf8"));
      found.push({ name: `conformance/${file}`, text: wrapConformanceSource(source), luau: conformanceLuau(source) });
    }
  }
  return found;
}
