// What the controller used to read from its own program comes from the worker
// when the worker displays the preview (#680), and behaves as it does when the
// page displays it: the toolbar's execution labels, including those of a route
// that failed; the executed lines the editor highlights; the possible
// breakpoint lines; and the scene warm-up, which the worker sends as a
// `player/previewHint`.
import { describe, expect, it } from "vitest";
import { GameExecutedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameExecutedMessage";
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

/** Run the reads with the switch in one position. */
async function reads(workerDisplays: boolean) {
  const h = await createPlayerHarness({
    workerDisplays,
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

    // The warm-up the worker sent for the selections, and what the page's own
    // hint would have planned from the whole program.
    const prefetches = h.toPage
      .filter((m) => PreviewHintMessage.type.isNotification(m))
      .map((m) => m.params);
    return {
      reached,
      unreached,
      breakpoints: breakpoints.result,
      prefetches,
      program: compiled.program,
    };
  } finally {
    h.dispose();
  }
}

describe("with the worker displaying the preview", () => {
  it("labels, highlights and lists breakpoints as the page's game does", async () => {
    const on = await reads(true);
    const off = await reads(false);

    expect(on.reached).toEqual(off.reached);
    expect(on.unreached).toEqual(off.unreached);
    expect(on.breakpoints).toEqual(off.breakpoints);

    // What was compared says something.
    expect(off.reached.executed.at(-1)?.executedLines).toBeTruthy();
    expect(off.unreached.labels.failed).toBe(true);
    expect(off.unreached.labels.connection).toContain("🞪");
    expect(off.unreached.labels.executed).toMatch(/main : \d+/);
    expect(off.breakpoints.lines.length).toBeGreaterThan(0);
  }, 120_000);

  it("sends the scene warm-up the page's own hint would plan", async () => {
    const on = await reads(true);
    const off = await reads(false);
    expect(off.prefetches).toEqual([]);
    // The page's hint, planned from the whole program for the same selections.
    const first = planPreviewHint(off.program, MAIN_URI, AFTER, undefined)!;
    const second = planPreviewHint(off.program, MAIN_URI, UNREACHED, first.state);
    const planned = [first, second]
      .filter((plan) => plan != null)
      .map(({ cursor, near, rest }) => ({ cursor, near, rest }));
    expect(on.prefetches).toEqual(planned);
    expect(on.prefetches[0]!.cursor.map((item: any) => item.src).join(" ")).toContain("b.png");
  }, 120_000);
});
