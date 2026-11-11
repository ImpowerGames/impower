import type { PreviewRoute } from "@impower/spark-engine/src/game/core/types/PreviewRoute";
import type { HostedRouteView } from "@impower/spark-web-player/src/route/routeViewMessages";
import { describe, expect, it } from "vitest";
import { barReadout } from "../../src/modules/spark-editor/components/preview-bar/barState";
import type { WorkspaceCache } from "@impower/spark-editor-protocol/src/types";
import {
  IDLE_DEBUG_SESSION,
  type DebugSessionState,
} from "../../src/modules/spark-editor/workspace/WorkspaceStore";

const URI = "file:///local/main.sd";

const at = (line: number) => ({
  uri: URI,
  range: {
    start: { line: line - 1, character: 0 },
    end: { line: line - 1, character: 0 },
  },
});

const choice = { kind: "pinned" as const, location: at(8), text: "Tell the truth." };
const auto = { kind: "auto" as const, location: at(8), text: "Tell the truth." };
const forced = { kind: "forced" as const, location: at(15), text: "trust > 3", verdict: true };
const clipped = { kind: "clipped" as const, location: at(18), text: "", passes: 12480 };

const route = (decisions: PreviewRoute["decisions"]): PreviewRoute => ({
  start: { scene: "interrogation", location: at(4) },
  target: at(21),
  decisions,
});

const view = (extra: Partial<HostedRouteView>): HostedRouteView => ({
  open: false,
  tab: "route" as const,
  toggles: { pinned: true, auto: true, forced: true, clipped: true },
  pins: [],
  ...extra,
});

const caretOn = (line: number): WorkspaceCache =>
  ({
    panes: {
      logic: {
        panel: "main",
        panels: {
          main: {
            activeEditor: {
              open: true,
              filename: "main.sd",
              selectedRange: {
                start: { line: line - 1, character: 0 },
                end: { line: line - 1, character: 0 },
              },
            },
          },
        },
      },
    },
  }) as unknown as WorkspaceCache;

const playing = (line: number): WorkspaceCache =>
  ({
    ...caretOn(21),
    preview: {
      modes: { game: { running: true, position: { uri: URI, line: line - 1 } } },
    },
  }) as unknown as WorkspaceCache;

const shown = (state: WorkspaceCache, v: HostedRouteView | null) => {
  const readout = barReadout(state, v, IDLE_DEBUG_SESSION, "desktop");
  return readout && [readout.icon, `${readout.name} ${readout.lines}`.trim(), readout.failed, readout.opensRoute];
};

describe("the readout under the game", () => {
  it("shows the detour when the route forced a branch, before any other icon", () => {
    expect(shown(caretOn(21), view({ route: route([choice, forced, clipped]) }))).toEqual([
      "forced",
      "interrogation (4 → 21)",
      false,
      true,
    ]);
  });

  it("shows the scissors when a loop was clipped and nothing was forced", () => {
    expect(shown(caretOn(21), view({ route: route([choice, clipped]) }))).toEqual([
      "clipped",
      "interrogation (4 → 21)",
      false,
      true,
    ]);
  });

  it("shows the pin when pins steered the route and nothing was forced or clipped", () => {
    expect(shown(caretOn(21), view({ route: route([choice]) }))).toEqual([
      "pinned",
      "interrogation (4 → 21)",
      false,
      true,
    ]);
  });

  it("shows no icon when the route runs as the game does", () => {
    expect(shown(caretOn(21), view({ route: route([auto]) }))).toEqual([
      null,
      "interrogation (4 → 21)",
      false,
      true,
    ]);
  });

  it("shows the warning and marks the label failed when there is no route to the line", () => {
    const failed = view({
      failure: {
        message: "No route reaches this line.",
        scene: "interrogation",
        start: at(4),
        target: at(21),
      },
    });
    expect(shown(caretOn(21), failed)).toEqual([
      "failure",
      "interrogation (4 → 21)",
      true,
      true,
    ]);
    expect(barReadout(caretOn(21), failed, IDLE_DEBUG_SESSION, "desktop")!.title).toBe("No route reaches this line.");
  });

  it("spells out the route in its hover", () => {
    expect(
      barReadout(
        caretOn(21),
        view({ route: route([choice, forced]) }),
        IDLE_DEBUG_SESSION,
        "desktop",
      )!.title,
    ).toBe(
      "Route from the top of scene interrogation, line 4 to line 21. The preview forced a branch the game would not take. Show the route.",
    );
  });

  it("keeps the executing line while playing, and its press shows that line", () => {
    const readout = barReadout(
      playing(33),
      view({ route: route([choice, forced]) }),
      IDLE_DEBUG_SESSION,
      "desktop",
    );
    expect(readout).toMatchObject({
      name: "main : 33",
      lines: "",
      icon: null,
      opensRoute: false,
      uri: URI,
      line: 32,
    });
  });

  it("shows the caret's line before the first route arrives", () => {
    expect(shown(caretOn(7), null)).toEqual([null, "main : 7", false, false]);
  });
});

const stoppedOn = (
  line: number,
  beat: "shown" | "held" | "none" | undefined,
): DebugSessionState => ({
  ...IDLE_DEBUG_SESSION,
  stopped: { reason: "breakpoint", threadId: 0, beat },
  stackTrace: {
    stackFrames: [
      { id: 0, name: "start", line: line - 1, column: 0, source: { path: URI } },
    ],
  },
});

const asToday = {
  name: "main : 12",
  lines: "",
  icon: null,
  title: "Playing line 12 of main",
  failed: false,
  stopped: false,
  opensRoute: false,
  uri: URI,
  line: 11,
};

const stoppedBefore = {
  name: "Stopped before main : 16",
  lines: "",
  icon: "stopped",
  title: "Stopped before line 16. It has not run yet.",
  failed: false,
  stopped: true,
  opensRoute: false,
  uri: URI,
  line: 15,
};

describe("the readout at a stop, while the run's last position is line 12", () => {
  it.each([
    ["no stop, on a phone", IDLE_DEBUG_SESSION, "phone", asToday],
    ["a stop on a beat it presented, on a phone", stoppedOn(16, "shown"), "phone", asToday],
    ["a stop on a media beat waiting for Resume, on a phone", stoppedOn(16, "held"), "phone", asToday],
    ["a stop that does not say what is on screen, on a phone", stoppedOn(16, undefined), "phone", asToday],
    [
      "a stop before a line whose frames have not arrived, on a phone",
      { ...stoppedOn(16, "none"), stackTrace: null },
      "phone",
      asToday,
    ],
    [
      "a stop before a line that has not run, on a phone, named from the stop's frame",
      stoppedOn(16, "none"),
      "phone",
      stoppedBefore,
    ],
    [
      "a stop before a line whose frame names no script, on a phone",
      {
        ...stoppedOn(16, "none"),
        stackTrace: { stackFrames: [{ id: 0, name: "start", line: 15, column: 0 }] },
      },
      "phone",
      { ...stoppedBefore, name: "Stopped before line 16", uri: undefined },
    ],
    ["a stop before a line that has not run, on the compact layout", stoppedOn(16, "none"), "compact", asToday],
    ["a stop before a line that has not run, on the desktop", stoppedOn(16, "none"), "desktop", asToday],
  ] as const)("%s", (_name, session, layout, expected) => {
    expect(barReadout(playing(12), null, session, layout)).toEqual(expected);
  });
});
