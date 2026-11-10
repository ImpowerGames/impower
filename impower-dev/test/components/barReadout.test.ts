import type { PreviewRoute } from "@impower/spark-engine/src/game/core/types/PreviewRoute";
import type { HostedRouteView } from "@impower/spark-web-player/src/route/routeViewMessages";
import { describe, expect, it } from "vitest";
import { barReadout } from "../../src/modules/spark-editor/components/preview-bar/barState";
import type { WorkspaceCache } from "@impower/spark-editor-protocol/src/types";

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
  const readout = barReadout(state, v);
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
    expect(barReadout(caretOn(21), failed)!.title).toBe("No route reaches this line.");
  });

  it("spells out the route in its hover", () => {
    expect(barReadout(caretOn(21), view({ route: route([choice, forced]) }))!.title).toBe(
      "Route from the top of scene interrogation, line 4 to line 21. The preview forced a branch the game would not take. Show the route.",
    );
  });

  it("keeps the executing line while playing, and its press shows that line", () => {
    const readout = barReadout(playing(33), view({ route: route([choice, forced]) }));
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
