import { readFileSync, readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { formatSource } from "./formatSource";

// #1227: the formatter lays out brace bodies by their braces. It may change
// only whitespace that carries no meaning, so a brace-body fixture and its
// formatted text must compile to the same program: the same static structs
// (`context`), the same layout trees (`sparkle`) and the same diagnostics.
// The messy variants are where this bites, since every line of theirs moves.

const __dirname = dirname(fileURLToPath(import.meta.url));
const UI_DIR = join(__dirname, "__snapshots__/format/ui");

const FIXTURES = readdirSync(UI_DIR).filter(
  (f) => f.includes("-brace-") && f.endsWith(".sd") && !f.endsWith(".formatted.sd"),
);

const URI = "file:///main.sd";

// Source positions and the binding names derived from them differ when only
// whitespace moves; everything else must not. A binding also keeps the text
// of its code (`source`), which the engine shows only in an error message,
// so that text is compared without its whitespace.
function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "span" || k === "exprId") continue;
      out[k] =
        k === "source" && typeof v === "string"
          ? v.replace(/\s+/g, "")
          : normalize(v);
    }
    return out;
  }
  return value;
}

function program(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as any);
  const result = compiler.compile({ textDocument: { uri: URI } }).program;
  return {
    context: normalize(result.context),
    sparkle: normalize(result.sparkle),
    diagnostics: (result.diagnostics?.[URI] ?? []).map((d) => ({
      severity: d.severity,
      message: typeof d.message === "string" ? d.message : d.message.value,
    })),
  };
}

describe("formatting a brace body keeps its program", () => {
  test("the brace-body fixtures are all here", () => {
    // A canonical and a messy fixture for each of the ten brace bodies.
    expect(FIXTURES.length).toBe(20);
  });

  for (const file of FIXTURES) {
    test(file, () => {
      const source = readFileSync(join(UI_DIR, file), "utf8");
      const formatted = formatSource(source);
      const before = program(source);
      // The fixtures compile cleanly: a messy line that the indented reader
      // drops is reported, and would make the messy variant mean less than
      // its canonical text.
      expect(before.diagnostics).toEqual([]);
      expect(program(formatted)).toEqual(before);
      if (file.endsWith("-messy.sd")) {
        // The messy variant moves every line, and means what its canonical
        // text means.
        expect(formatted).not.toBe(source);
        const canonical = readFileSync(
          join(UI_DIR, file.replace("-messy.sd", ".sd")),
          "utf8",
        );
        expect(before).toEqual(program(canonical));
      }
    });
  }
});
