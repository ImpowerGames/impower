// Regenerates src/compiler/lower/lowerers/sparkleStyleProps.ts by
// statically extracting the canonical prop names + short aliases from the
// sparkle-style-transformer source. No execution of the transformer (which
// pulls a large import graph) — just a regex sweep of the two constant
// files, so this stays a dependency-free build step.
//
//   node packages/sparkdown/scripts/genSparkleStyleProps.ts
//
// Run whenever STYLE_TRANSFORMERS.ts / STYLE_ALIASES.ts change.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const txPath = path.join(
  repo,
  "packages/sparkle-style-transformer/src/constants/STYLE_TRANSFORMERS.ts",
);
const alPath = path.join(
  repo,
  "packages/sparkle-style-transformer/src/constants/STYLE_ALIASES.ts",
);
const outPath = path.join(
  here,
  "../src/compiler/lower/lowerers/sparkleStyleProps.ts",
);

const tx = fs.readFileSync(txPath, "utf8");
const al = fs.readFileSync(alPath, "utf8");

const txBody = tx.split("STYLE_TRANSFORMERS = {")[1]!.split("} as const")[0]!;
const canon: string[] = [];
for (const m of txBody.matchAll(/^\s*("?)([a-zA-Z][a-zA-Z0-9-]*)\1\s*:/gm)) {
  canon.push(m[2]!);
}

const alBody = al.split("STYLE_ALIASES = {")[1]!.split("} as const")[0]!;
const aliases: Record<string, string> = {};
// Keys may be quoted ("c-tl") or bare identifiers (c, m, p, w) — match both.
for (const m of alBody.matchAll(
  /^\s*("?)([a-zA-Z][a-zA-Z0-9_-]*)\1\s*:\s*"([^"]+)"/gm,
)) {
  aliases[m[2]!] = m[3]!;
}

const cset = new Set(canon);
const bad = Object.values(aliases).filter((v) => !cset.has(v));
if (bad.length > 0) {
  throw new Error(`Alias targets not found in canonical set: ${bad.join(", ")}`);
}

const q = (s: string) => JSON.stringify(s);
let out = "";
out += "// AUTO-GENERATED — do not edit by hand.\n";
out += "// Mirrors the sparkle prop surface from\n";
out +=
  "//   packages/sparkle-style-transformer/src/constants/STYLE_TRANSFORMERS.ts (canonical names)\n";
out +=
  "//   packages/sparkle-style-transformer/src/constants/STYLE_ALIASES.ts      (short aliases)\n";
out += "// Regenerate with: node packages/sparkdown/scripts/genSparkleStyleProps.ts\n";
out += "// Used by lowerLuauStyle to validate `style` block property names and\n";
out += "// de-alias them to their canonical sparkle spelling for the engine.\n\n";
out += "export const CANONICAL_STYLE_PROPS: ReadonlySet<string> = new Set([\n";
for (const c of canon) out += "  " + q(c) + ",\n";
out += "]);\n\n";
out += "export const STYLE_PROP_ALIASES: Readonly<Record<string, string>> = {\n";
for (const [k, v] of Object.entries(aliases)) out += "  " + q(k) + ": " + q(v) + ",\n";
out += "};\n\n";
out += "// Resolve an authored style property name to its canonical sparkle\n";
out += "// spelling. Returns null if the name is neither a canonical prop nor a\n";
out += "// known alias (the caller emits an “unknown style property” diagnostic).\n";
out += "export function resolveStyleProp(name: string): string | null {\n";
out += "  const canonical = STYLE_PROP_ALIASES[name] ?? name;\n";
out += "  return CANONICAL_STYLE_PROPS.has(canonical) ? canonical : null;\n";
out += "}\n";

fs.writeFileSync(outPath, out);
console.log(
  `wrote ${path.relative(repo, outPath)} — ${canon.length} props, ${
    Object.keys(aliases).length
  } aliases`,
);
