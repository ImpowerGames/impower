// The page holds only each program's summary, so what it shows about a
// program comes from the worker's game: the toolbar's execution labels,
// including those of a route that failed; the executed lines the editor
// highlights; the possible breakpoint lines; and the scene warm-up, which the
// worker sends as a `player/previewHint`.
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

-> start

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

/** Run the reads. */
async function reads() {
  const h = await createPlayerHarness({
    workerDisplays: true,
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

    // Turning debugging on and off from the preview toolbar, and what the
    // game that displays the preview made of it.
    const debugging = () => h.workerState.gameState.game?.context?.system?.debugging;
    const enabled = await h.controller.handleEnableGameDebug(
      EnableGameDebugMessage.type.request({}),
    );
    const debug = { answer: "error" in enabled, on: debugging() };
    const disabled = await h.controller.handleDisableGameDebug(
      DisableGameDebugMessage.type.request({}),
    );
    const undebug = { answer: "error" in disabled, on: debugging() };

    // The warm-up the worker sent for the selections.
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
      // The whole program, which only the worker holds.
      program: h.workerState.gameState.game!.program,
    };
  } finally {
    h.dispose();
  }
}

describe("the preview's reads", () => {
  it("label, highlight and list breakpoints as recorded", async () => {
    const on = await reads();
    expect({
      reached: on.reached,
      unreached: on.unreached,
      breakpoints: on.breakpoints,
      debug: on.debug,
      undebug: on.undebug,
    }).toMatchSnapshot();

    // What was recorded says something.
    expect(on.summary.summary).toBe(true);
    expect(on.reached.executed.at(-1)?.executedLines).toBeTruthy();
    expect(on.unreached.labels.failed).toBe(true);
    expect(on.unreached.labels.connection).toContain("🞪");
    expect(on.unreached.labels.executed).toMatch(/main : \d+/);
    expect(on.breakpoints.lines.length).toBeGreaterThan(0);
    // The toolbar's toggle answered, and the game that displays the preview
    // entered the mode and left it again.
    expect(on.debug).toEqual({ answer: false, on: true });
    expect(on.undebug).toEqual({ answer: false, on: false });
  }, 120_000);

  it("send the scene warm-up planned from the whole program", async () => {
    const on = await reads();
    // The hint planned from the whole program for the same selections.
    const first = planPreviewHint(on.program, MAIN_URI, AFTER, undefined)!;
    const second = planPreviewHint(on.program, MAIN_URI, UNREACHED, first.state);
    const planned = [first, second]
      .filter((plan) => plan != null)
      .map(({ cursor, near, rest }) => ({ cursor, near, rest }));
    expect(on.prefetches).toEqual(planned);
    expect(on.prefetches[0]!.cursor.map((item: any) => item.src).join(" ")).toContain("b.png");
  }, 120_000);
});
