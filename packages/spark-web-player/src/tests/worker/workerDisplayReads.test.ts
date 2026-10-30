import { describe, expect, it } from "vitest";
import { GameExecutedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameExecutedMessage";
import { DisableGameDebugMessage } from "@impower/spark-engine/src/game/core/classes/messages/DisableGameDebugMessage";
import { EnableGameDebugMessage } from "@impower/spark-engine/src/game/core/classes/messages/EnableGameDebugMessage";
import { GetGamePossibleBreakpointLocationsMessage } from "@impower/spark-engine/src/game/core/classes/messages/GetGamePossibleBreakpointLocationsMessage";
import { planPreviewHint } from "../../main/utils/previewHint";
import { PreviewHintMessage } from "../../main/workers/messages/PreviewHintMessage";
import { createPlayerHarness, MAIN_URI } from "./playerHarness";

const SOURCE = `define SPRITE_A as image with
  src = "https://example.com/a.png"
end

define SPRITE_B as image with
  src = "https://example.com/b.png"
end



scene start
  HERO:
    [[SPRITE_A]]
    The first line.

  HERO:
    [[SPRITE_B]]
    The line after.

  -> END

  HERO:
    A line no route reaches.
end
`;

const lineOf = (text: string) => SOURCE.split("\n").findIndex((l) => l.includes(text));
const FIRST = lineOf("The first line.");
const UNREACHED = lineOf("A line no route reaches.");
const AFTER = lineOf("The line after.");

async function reads() {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: SOURCE }],
    startFrom: { file: MAIN_URI, line: FIRST },
  });
  try {
    const compiled = await h.compile();
    const labels = () => ({
      failed: h.refs.locationItems.classList.contains("error"),
      title: h.refs.locationItems.getAttribute("title"),
      launch: h.refs.launchLabel.textContent,
      connection: h.refs.connectionLabel.textContent,
      executed: h.refs.executedLabel.textContent,
      executionShown: !h.refs.executionInfo.hidden,
    });
    const executedSent = () =>
      h.toEditor
        .filter((m) => m.method === GameExecutedMessage.method)
        .map((m) => ({
          executedLines: m.params.executedLines,
          firstLocation: m.params.firstLocation,
          lastLocation: m.params.lastLocation,
          simulation: m.params.simulation,
        }));

    h.toEditor.length = 0;
    await h.select(AFTER);
    const reached = { labels: labels(), executed: executedSent() };

    h.toEditor.length = 0;
    await h.select(UNREACHED);
    const unreached = { labels: labels(), executed: executedSent() };

    const breakpoints = await h.controller.handleGetGamePossibleBreakpointLocations(
      GetGamePossibleBreakpointLocationsMessage.type.request({
        search: {
          uri: MAIN_URI,
          range: { start: { line: 0, character: 0 }, end: { line: 40, character: 0 } },
        },
      }),
    );

    const debugging = () => h.workerState.gameState.game?.context?.system?.debugging;
    const enabled = await h.controller.handleEnableGameDebug(
      EnableGameDebugMessage.type.request({}),
    );
    const debug = { answer: "error" in enabled, on: debugging() };
    const disabled = await h.controller.handleDisableGameDebug(
      DisableGameDebugMessage.type.request({}),
    );
    const undebug = { answer: "error" in disabled, on: debugging() };

    const prefetches = h.toPage
      .filter((m) => PreviewHintMessage.type.isNotification(m))
      .map((m) => m.params);
    return {
      reached,
      unreached,
      debug,
      undebug,
      breakpoints: breakpoints.result,
      prefetches,
      summary: compiled.program,
      program: h.workerState.gameState.game!.program,
    };
  } finally {
    h.dispose();
  }
}

describe("the preview's reads", () => {
  it("label, highlight and list breakpoints", async () => {
    const on = await reads();

    expect(on.summary.summary).toBe(true);
    const beatA = lineOf("[[SPRITE_A]]");
    const beatB = lineOf("[[SPRITE_B]]");
    expect(on.reached.executed.at(-1)?.executedLines).toEqual({
      [MAIN_URI]: { ranges: [beatA, beatA + 2, beatB, beatB + 2], last: beatB + 2 },
    });
    expect(on.unreached.executed.at(-1)?.executedLines).toEqual({
      [MAIN_URI]: { ranges: [UNREACHED, UNREACHED], last: UNREACHED },
    });
    expect(on.unreached.labels.failed).toBe(true);
    expect(on.unreached.labels.connection).toContain("🞪");
    expect(on.unreached.labels.executed).toMatch(/main : \d+/);
    expect(on.reached.executed.at(-1)?.firstLocation?.range.start.line).toBe(lineOf("[[SPRITE_A]]"));
    expect(on.reached.executed.at(-1)?.lastLocation?.range.start.line).toBe(lineOf("[[SPRITE_B]]"));
    expect(on.reached.labels.launch).toBe(`main : ${lineOf("[[SPRITE_A]]") + 1}`);
    expect(on.unreached.labels.launch).toBe(`main : ${lineOf("scene start") + 1}`);
    expect(on.unreached.labels.title).toMatch(/No path through this scene reaches this line/);
    for (const line of [lineOf("[[SPRITE_A]]"), lineOf("[[SPRITE_B]]"), UNREACHED]) {
      expect(on.breakpoints.lines).toContain(line);
    }
    expect(on.breakpoints.lines.length).toBeGreaterThan(0);
    expect(on.debug).toEqual({ answer: false, on: true });
    expect(on.undebug).toEqual({ answer: false, on: false });
  }, 120_000);

  it("send the scene warm-up planned from the whole program", async () => {
    const on = await reads();
    const first = planPreviewHint(on.program, MAIN_URI, AFTER, undefined)!;
    const second = planPreviewHint(on.program, MAIN_URI, UNREACHED, first.state);
    const planned = [first, second]
      .filter((plan) => plan != null)
      .map(({ cursor, near, rest }) => ({ cursor, near, rest }));
    expect(on.prefetches).toEqual(planned);
    expect(on.prefetches[0]!.cursor.map((item: any) => item.src).join(" ")).toContain("b.png");
  }, 120_000);
});
