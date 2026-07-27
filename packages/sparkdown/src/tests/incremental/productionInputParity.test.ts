import { printTree } from "@impower/textmate-grammar-tree/src/tree/utils/printTree";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { SparkdownDocument } from "../../compiler/classes/SparkdownDocument";
import { getParser } from "../compiler/grammarSnapshot";

// PRODUCTION-INPUT PARITY GUARD.
//
// The grammar/incremental snapshot suites parse a `string`, which lezer wraps as
// a WHOLE-REST input (one chunk = the entire remaining document). But production
// (SparkdownDocumentRegistry) parses a `SparkdownDocument`, whose `chunk()`
// returns ONE LINE with `lineChunks = true`. These are DIFFERENT parser code
// paths, so a string-only snapshot can be byte-identical while production is
// wrong.
//
// This test parses every grammar fixture via BOTH inputs and asserts identical
// trees. The abandoned line+stack tokenizer (Phase A/B) passed the string
// snapshots but FAILED here — its per-line path mis-assembled nested block trees
// (detached begins / wrong spans for if / for / while / choose / then /
// function). The whole-block parser is input-agnostic and passes. Any future
// incremental refactor MUST keep this green (and exercise SparkdownDocument
// input), or it will ship a regression the snapshots can't see.
//
// See docs/PHASE_C_INCREMENTAL_DESIGN.md + project memory for the per-line
// tree-assembly prerequisite that must be solved in isolation first.

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOTS_DIR = join(__dirname, "../compiler/__snapshots__/grammar");

function fixtures(): { name: string; source: string }[] {
  const out: { name: string; source: string }[] = [];
  for (const cat of readdirSync(SNAPSHOTS_DIR)) {
    const dir = join(SNAPSHOTS_DIR, cat);
    if (!statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".sd")) continue;
      out.push({
        name: `${cat}/${f.slice(0, -3)}`,
        source: readFileSync(join(dir, f), "utf8"),
      });
    }
  }
  return out;
}

const strip = (s: string) => s.replace(/\[\d+m/g, "");

describe("production-input parity (string vs SparkdownDocument)", () => {
  for (const fx of fixtures()) {
    test(fx.name, () => {
      const parser = getParser();
      const viaString = strip(printTree(parser.parse(fx.source), fx.source));
      const doc = new SparkdownDocument("file:///t.sd", "sparkdown", 1, fx.source);
      const viaDoc = strip(printTree(parser.parse(doc as any), fx.source));
      expect(viaDoc).toBe(viaString);
    });
  }
});
