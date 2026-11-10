import type { HostedRouteView } from "@impower/spark-web-player/src/route/routeViewMessages";
import { describe, expect, it } from "vitest";
import {
  choiceMarkAction,
  routeMarks,
} from "../../src/modules/spark-editor/workspace/route/routeMarks";

const URI = "file:///local/main.sd";

const at = (line: number) => ({
  uri: URI,
  range: {
    start: { line: line - 1, character: 0 },
    end: { line: line - 1, character: 0 },
  },
});

const option = (line: number, text: string) => ({ location: at(line), text, offer: 1 });

const options = [
  option(8, "Tell the truth."),
  option(10, "Show the photograph."),
  option(12, "Lie."),
];

const view = (pinned: boolean): HostedRouteView => ({
  open: false,
  toggles: { pinned: true, auto: true, forced: true, clipped: true },
  pins: pinned ? [{ uri: URI, line: 7, offer: 1 }] : [],
  route: {
    start: { scene: "interrogation", location: at(4) },
    target: at(21),
    decisions: [
      {
        kind: pinned ? "pinned" : "auto",
        location: at(8),
        text: "Tell the truth.",
        meeting: 1,
        menu: at(7),
        options,
      },
      { kind: "forced", location: at(15), text: "trust > 3", verdict: true },
      { kind: "clipped", location: at(18), text: "", passes: 12480 },
    ],
    forcedLines: { [URI]: [15, 20] },
  },
});

describe("the marks a route puts on the script", () => {
  it("marks each choice the route took and no forced condition or clipped loop", () => {
    const marks = routeMarks(view(true));
    expect(marks.choices).toEqual([
      {
        uri: URI,
        line: 7,
        icon: "pinned",
        title: "Choice · line 8",
        text: "The preview takes your pinned option here.",
        options: [
          { text: "Tell the truth.", taken: true, pinned: true },
          { text: "Show the photograph.", taken: false, pinned: false },
          { text: "Lie.", taken: false, pinned: false },
        ],
        unpin: true,
      },
    ]);
  });

  it("marks an unpinned choice with the options list and says the preview chose it", () => {
    const [mark] = routeMarks(view(false)).choices;
    expect(mark!.icon).toBe("auto");
    expect(mark!.unpin).toBe(false);
    expect(mark!.text).toBe("No pin. The preview chose this option to reach line 21.");
  });

  it("dashes the lines that ran only because a branch was forced", () => {
    expect(routeMarks(view(false)).forced).toEqual([
      { uri: URI, lines: [15, 16, 17, 18, 19, 20] },
    ]);
  });

  it("clears every mark when there is no route", () => {
    expect(routeMarks(null)).toEqual({ choices: [], forced: [] });
  });
});

describe("a press in the choice popover", () => {
  it("pins the pressed option and clears the stop's other pin", () => {
    expect(choiceMarkAction(view(true), URI, 7, { kind: "pin", option: 2 })).toEqual({
      kind: "changePins",
      change: {
        add: [{ uri: URI, line: 11, offer: 1 }],
        remove: [{ uri: URI, line: 7, offer: 1 }],
      },
    });
  });

  it("unpins the stop", () => {
    expect(choiceMarkAction(view(true), URI, 7, { kind: "unpin" })).toEqual({
      kind: "changePins",
      change: { remove: [{ uri: URI, line: 7, offer: 1 }] },
    });
  });

  it("opens the whole route, and ignores a line the route took no choice on", () => {
    expect(choiceMarkAction(view(true), URI, 7, { kind: "route" })).toBe("route");
    expect(choiceMarkAction(view(true), URI, 14, { kind: "pin", option: 0 })).toBeNull();
  });
});
