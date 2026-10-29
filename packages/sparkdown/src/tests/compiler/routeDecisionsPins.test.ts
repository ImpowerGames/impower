// #1657 — the route's report says where a pin was not followed. A menu's own
// options are those it offers, those of the same statement, and those it
// offered at an earlier meeting, among them an option a thread (`<- name`)
// adds from another statement: once-only and already taken, such an option
// is not offered at a later meeting, and a pin on that later offer is
// reported not followed there. A menu that offers only a thread's options
// owns none of its own statement's options, which is a known limit.
import { describe, expect, test } from "vitest";
import type { RoutePlan } from "../../compiler/utils/planRoute";
import { routeDecisions } from "../../compiler/utils/routeDecisions";
import { pinnedOptionsOf } from "../../compiler/utils/routePins";

/** Addresses in two chunks: a thread's option in one, the menu's own option
 *  and the site the menu is met at in the other. */
const KEY = 4 * 2 ** 21 + 6;
const LEAVE = 8 * 2 ** 21 + 6;
const MENU = 8 * 2 ** 21 + 8;

/** A hub met twice: the first meeting offers the thread's "Ask about the
 *  key." and the menu's own "Leave." and takes the key; the second offers
 *  only "Leave." and takes it. */
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

/** The key's pins at its first and second offers, its line being 13. */
const pinned = pinnedOptionsOf(
  [
    { uri: "main", line: 13, offer: 1 },
    { uri: "main", line: 13, offer: 2 },
  ],
  (_uri, line) => (line === 13 ? KEY : undefined),
);

describe("a pin on a gated option of a menu that offers only a thread's options", () => {
  test("is not reported, since nothing the menu offers names its own statement (a known limit)", () => {
    // `* if key [Show the key.]` in its menu's own statement, its gate left
    // false, so the menu offers only the thread's option, in another chunk.
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
