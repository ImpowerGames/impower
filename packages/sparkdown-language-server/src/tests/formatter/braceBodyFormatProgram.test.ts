import { readFileSync, readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { NO_START_SCENE_MESSAGE } from "@impower/sparkdown/src/compiler/utils/startScene";
import { formatSource } from "./formatSource";

const __dirname = dirname(fileURLToPath(import.meta.url));
const UI_DIR = join(__dirname, "__snapshots__/format/ui");

const FIXTURES = readdirSync(UI_DIR).filter(
  (f) => f.includes("-brace-") && f.endsWith(".sd") && !f.endsWith(".formatted.sd"),
);

const URI = "file:///main.sd";

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
    diagnostics: (result.diagnostics?.[URI] ?? [])
      .map((d) => ({
        severity: d.severity,
        message: typeof d.message === "string" ? d.message : d.message.value,
      }))
      .filter((d) => d.message !== NO_START_SCENE_MESSAGE),
  };
}

describe("formatting a brace body keeps its program", () => {
  test("the brace-body fixtures are all here", () => {
    expect(FIXTURES.length).toBe(21);
  });

  for (const file of FIXTURES) {
    test(file, () => {
      const source = readFileSync(join(UI_DIR, file), "utf8");
      const formatted = formatSource(source);
      const before = program(source);
      expect(before.diagnostics).toEqual([]);
      expect(program(formatted)).toEqual(before);
      if (file.endsWith("-messy.sd")) {
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
