import { describe, expect, test } from "vitest";
import type { RoutePlan } from "../../compiler/utils/planRoute";
import { routeDecisions } from "../../compiler/utils/routeDecisions";
import { pinnedOptionsOf } from "../../compiler/utils/routePins";

const KEY = 4 * 2 ** 21 + 6;
const LEAVE = 8 * 2 ** 21 + 6;
const MENU = 8 * 2 ** 21 + 8;

const hub: RoutePlan = {
  from: "start",
  to: 0,
  steps: [],
  decisions: [
    { kind: "choice", site: MENU, value: String(KEY) },
    { kind: "choice", site: MENU, value: String(LEAVE) },
  ],
  conditions: [],
  choices: [
    {
      options: ["Ask about the key.", "Leave."],
      selected: 0,
      sources: [String(KEY), String(LEAVE)],
    },
    { options: ["Leave."], selected: 0, sources: [String(LEAVE)] },
  ],
};

const pinned = pinnedOptionsOf(
  [
    { uri: "main", line: 13, offer: 1 },
    { uri: "main", line: 13, offer: 2 },
  ],
  (_uri, line) => (line === 13 ? KEY : undefined),
);

describe("a pin on a gated option of a menu that offers only a thread's options", () => {
  test("is not reported, since nothing the menu offers names its own statement (a known limit)", () => {
    const GATE = 3 * 2 ** 21 + 14;
    const THREAD = 8 * 2 ** 21 + 6;
    const SITE = 8 * 2 ** 21 + 8;
    const route: RoutePlan = {
      from: "start",
      to: 0,
      steps: [],
      decisions: [
        { kind: "condition", site: GATE, value: false },
        { kind: "choice", site: SITE, value: String(THREAD) },
      ],
      conditions: [],
      choices: [
        { options: ["Thread option."], selected: 0, sources: [String(THREAD)] },
      ],
    };
    const gated = pinnedOptionsOf([{ uri: "main", line: 5, offer: 1 }], (_uri, line) =>
      line === 5 ? GATE : undefined,
    );
    const [choice] = routeDecisions(route, () => undefined, undefined, gated);
    expect([choice!.kind, choice!.option, choice!.notFollowed]).toEqual([
      "auto",
      "Thread option.",
      undefined,
    ]);
    expect(choice!.unoffered).toBeUndefined();
  });
});

describe("a pin on a threaded option the menu no longer offers", () => {
  test("is reported not followed at the meeting that did not offer it", () => {
    const decisions = routeDecisions(hub, () => undefined, undefined, pinned);
    expect(decisions.map((d) => [d.kind, d.option, d.notFollowed])).toEqual([
      ["pinned", "Ask about the key.", undefined],
      ["auto", "Leave.", true],
    ]);
  });

  test("is reported once, at the first meeting that did not offer it", () => {
    const thrice: RoutePlan = {
      ...hub,
      decisions: [...hub.decisions, hub.decisions[1]!],
      choices: [...hub.choices, hub.choices[1]!],
    };
    const decisions = routeDecisions(thrice, () => undefined, undefined, pinned);
    expect(decisions.map((d) => d.notFollowed)).toEqual([
      undefined,
      true,
      undefined,
    ]);
  });
});
