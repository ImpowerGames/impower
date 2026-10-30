import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { wrapConformanceSource } from "../luau-conformance/conformanceTestHarness";
import { applyUpstreamPatches } from "../luau-conformance/upstreamPatches";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GRAMMAR_ROOT = join(__dirname, "__snapshots__", "grammar");
const CONFORMANCE_ROOT = join(__dirname, "..", "luau-conformance", "upstream", "conformance");

export interface KnownDisagreement {
  fixture: string;
  issue: number;
  reason: string;
  limitation?: { diagnostic: string; documentation: string };
}

const INTEGER_LIMITATION = {
  diagnostic: "Luau 64-bit integer literals are not supported in Sparkdown",
  documentation: "docs/runtime/DIVERGENCES.md#luaus-native-64-bit-integers-are-unsupported",
};

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
  ...UNSUPPORTED_INTEGER_INPUTS,
];

export interface LuauInput {
  name: string;
  text: string;
  luau?: string;
}

export function conformanceLuau(source: string): string {
  return `function run()\n${source}\nend\n`;
}

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
