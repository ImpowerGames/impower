// Nothing the worker sends the page carries a program or a checkpoint, for an
// edit or for a suggestion: the page only ever reads a program's summary.
import { describe, expect, it } from "vitest";
import { createPlayerHarness, MAIN_URI } from "./playerHarness";

const SOURCE = [
  "define hero as character with",
  `  name = "Hero"`,
  "end",
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

/** Where a program's body or a checkpoint appears in `value`. */
function programShaped(value: unknown): string[] {
  const found: string[] = [];
  const walk = (v: any, path: string) => {
    if (!v || typeof v !== "object") {
      return;
    }
    for (const [key, child] of Object.entries(v)) {
      const at = `${path}.${key}`;
      if (
        key === "compiled" ||
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

async function run() {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: SOURCE }],
    startFrom: { file: MAIN_URI, line: 0 },
  });
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
      overlay: h.overlay.textContent ?? "",
      messages: h.toPage.length,
    };
  } finally {
    h.dispose();
  }
}

describe("what the worker sends the page", () => {
  it("carries no program or checkpoint", async () => {
    const on = await run();
    expect(on.messages).toBeGreaterThan(0);
    expect(on.shaped).toEqual([]);
    // It displayed the preview all the same.
    expect(on.overlay).toContain("Line uno of dialogue in scene 2.");
  }, 120_000);

  it("is read by a check that finds a whole program and a checkpoint", () => {
    const answer = {
      result: {
        program: { uri: MAIN_URI, compiled: {} },
        checkpoint: "{}",
      },
    };
    expect(programShaped(answer)).toEqual([
      ".result.program (not a summary)",
      ".result.program.compiled",
      ".result.checkpoint",
    ]);
    expect(programShaped({ result: { program: { uri: MAIN_URI, summary: true } } })).toEqual([]);
  });
});
