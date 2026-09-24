// Nothing the worker sends the page carries a program, a checkpoint or path
// locations, for an edit or for a suggestion, and the worker never serializes
// a compiled story: the page only ever reads a program's summary.
import { afterEach, describe, expect, it, vi } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { createPlayerHarness, MAIN_URI } from "./playerHarness";

const SOURCE = [
  "define hero as character:",
  `  name = "Hero"`,
  "",
  ...Array.from({ length: 4 }, (_, s) => [
    `scene scene_${s}`,
    `= INT. ROOM ${s} - DAY`,
    ":",
    `  Action describing room ${s}.`,
    "hero:",
    `  Line one of dialogue in scene ${s}.`,
    `-> scene_${(s + 1) % 4}`,
    "end",
    "",
  ]).flat(),
].join("\n");

const LINE = SOURCE.split("\n").indexOf("  Line one of dialogue in scene 2.");

/** Where a program's body, a checkpoint or path locations appear in `value`. */
function programShaped(value: unknown): string[] {
  const found: string[] = [];
  const walk = (v: any, path: string) => {
    if (!v || typeof v !== "object") {
      return;
    }
    for (const [key, child] of Object.entries(v)) {
      const at = `${path}.${key}`;
      if (
        key === "pathLocations" ||
        key === "compiled" ||
        key === "compiledBuffer" ||
        key === "checkpoint" ||
        key === "context" ||
        key === "sceneAssets"
      ) {
        found.push(at);
      }
      if (key === "program" && child && typeof child === "object" && !(child as any).summary) {
        found.push(`${at} (not a summary)`);
      }
      walk(child, at);
    }
  };
  walk(value, "");
  return found;
}

afterEach(() => vi.restoreAllMocks());

async function run() {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: SOURCE }],
    startFrom: { file: MAIN_URI, line: 0 },
  });
  // The player's own compiler. Configuring it compiled the builtins prelude
  // once, in a compiler of the prelude's own, which is not the story of any
  // edit or suggestion.
  const compiler: SparkdownCompiler = h.workerState.compilerState.compiler;
  const serialize = vi.spyOn(compiler as any, "serializeCompiledProgram");
  try {
    await h.compile();
    await h.select(LINE);
    // An edit, then a suggestion browsed and closed.
    const lineText = "  Line one of dialogue in scene 2.";
    await h.edit([
      {
        range: { start: { line: LINE, character: 2 }, end: { line: LINE, character: 10 } },
        text: "Line uno",
      },
    ]);
    await h.compile();
    await h.suggest(
      [
        {
          range: { start: { line: LINE, character: 2 }, end: { line: LINE, character: lineText.length } },
          text: "A suggested line.",
        },
      ],
      LINE,
    );
    await h.closeSuggestions();
    return {
      shaped: h.toPage.flatMap((message) => programShaped(message)),
      serialized: serialize.mock.calls.length,
      overlay: h.overlay.textContent ?? "",
      messages: h.toPage.length,
    };
  } finally {
    h.dispose();
  }
}

describe("what the worker sends the page", () => {
  it("carries no program, checkpoint or path locations, and no story is serialized", async () => {
    const on = await run();
    expect(on.messages).toBeGreaterThan(0);
    expect(on.shaped).toEqual([]);
    expect(on.serialized).toBe(0);
    // It displayed the preview all the same.
    expect(on.overlay).toContain("Line uno of dialogue in scene 2.");
  }, 120_000);

  it("is read by a check that finds a whole program and a checkpoint", () => {
    const answer = {
      result: {
        program: { uri: MAIN_URI, pathLocations: {}, compiled: {} },
        checkpoint: "{}",
      },
    };
    expect(programShaped(answer)).toEqual([
      ".result.program (not a summary)",
      ".result.program.pathLocations",
      ".result.program.compiled",
      ".result.checkpoint",
    ]);
    expect(programShaped({ result: { program: { uri: MAIN_URI, summary: true } } })).toEqual([]);
  });
});
