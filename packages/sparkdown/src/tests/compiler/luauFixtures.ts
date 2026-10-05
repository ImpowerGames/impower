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
// disagree about whether there is a syntax error (#1284). Bugs name the open
// issue to fix; intentional limitations also name their decision and docs,
// which remain valid after issue closure. Integer limitations are checked
// explicitly by the official oracle and are not claims of parser agreement.

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
  /** The bug to fix, or the decision documenting an intentional limitation. */
  issue: number;
  /** Which side reports a syntax error, and where. */
  reason: string;
  /** A deliberate unsupported feature, retained after its decision issue closes. */
  limitation?: { diagnostic: string; documentation: string };
}

const INTEGER_LIMITATION = {
  diagnostic: "Luau 64-bit integer literals are not supported in Sparkdown",
  documentation: "docs/runtime/DIVERGENCES.md#luaus-native-64-bit-integers-are-unsupported",
};

// Exactly these two pinned conformance files require native 64-bit integers.
// #1309 records the decision to keep them unsupported; it need not stay open.
export const UNSUPPORTED_INTEGER_INPUTS: KnownDisagreement[] = [
  {
    fixture: "conformance/integers.luau",
    issue: 1309,
    reason: "Luau accepts the literals; Sparkdown deliberately rejects native 64-bit integers",
    limitation: INTEGER_LIMITATION,
  },
  {
    fixture: "conformance/integers_regspill.luau",
    issue: 1309,
    reason: "Luau accepts the literals; Sparkdown deliberately rejects native 64-bit integers",
    limitation: INTEGER_LIMITATION,
  },
];

export const KNOWN_DISAGREEMENTS: KnownDisagreement[] = [
  {
    fixture: "grammar/luau-declaration/repeat-local-before-until.sd",
    issue: 1304,
    reason: "Luau only: the prelude unit drops a top-level repeat loop's until clause, so the parser expects until",
  },
  ...UNSUPPORTED_INTEGER_INPUTS,
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
