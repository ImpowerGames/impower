// #1657 — the route list's choice entries expand to the pin control: what
// the preview did at the stop, the options offered there in script order with
// the one taken marked, each with Pin or Pinned, and Unpin. The player asks
// the host to change the pins (`preview/changeRoutePins`); a host that does
// not save the change returns the control to its previous state with a note.
// The list offers Clear pins while any pin exists, lists the pins whose line
// holds no option with Remove, and says when a pin was not followed. The
// route button shows the pin when pins steered the route and nothing was
// forced or clipped.

import { afterEach, describe, expect, test } from "vitest";
import {
  MessageProtocol,
  sendProtocolMessage,
} from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { ChangeRoutePinsMessage } from "@impower/spark-editor-protocol/src/protocols/preview/ChangeRoutePinsMessage";
import { SetRoutePinsMessage } from "@impower/spark-editor-protocol/src/protocols/preview/SetRoutePinsMessage";
import type { PreviewRoute } from "@impower/spark-engine/src/game/core/types/PreviewRoute";
import { GamePlayerController } from "../GamePlayerController";

const URI = "file://proj/main.sd";

const at = (line: number, uri = URI) => ({
  uri,
  range: {
    start: { line: line - 1, character: 0 },
    end: { line: line - 1, character: 0 },
  },
});

/** A pin on the 1-based `line` at its `offer`-th offer. */
const pin = (line: number, offer = 1) => ({ uri: URI, line: line - 1, offer });

const options = (pinned?: number) =>
  [
    ["Tell the truth.", 8],
    ["Show the photograph.", 10],
    ["Lie.", 12],
  ].map(([text, line]) => ({
    location: at(line as number),
    text: text as string,
    offer: 1,
    ...(pinned === line ? { pinned: true as const } : {}),
  }));

/** #1655's example at line 21 with "Tell the truth." pinned. */
const pinnedRoute = (): PreviewRoute => ({
  start: { scene: "interrogation", location: at(4) },
  target: at(21),
  decisions: [
    {
      kind: "pinned",
      location: at(8),
      text: "Tell the truth.",
      meeting: 1,
      options: options(8),
    },
    { kind: "forced", location: at(15), text: "trust > 3", verdict: true },
    { kind: "clipped", location: at(18), text: "", verdict: false, passes: 12480 },
  ],
});

/** #1655's example at line 11 with "Lie." pinned, which the route did not
 *  follow. */
const notFollowedRoute = (): PreviewRoute => ({
  start: { scene: "interrogation", location: at(4) },
  target: at(11),
  decisions: [
    {
      kind: "auto",
      location: at(10),
      text: "Show the photograph.",
      meeting: 1,
      options: options(12),
      notFollowed: true,
    },
  ],
});

const controllers: GamePlayerController[] = [];

function player() {
  const host = document.createElement("div");
  const viewport = document.createElement("div");
  const leftItems = document.createElement("div");
  const locationItems = document.createElement("div");
  const routeButton = document.createElement("div");
  const routeList = document.createElement("div");
  leftItems.append(routeButton, locationItems);
  viewport.append(leftItems, routeList);
  host.append(viewport);
  document.body.append(host);
  const sent: any[] = [];
  host.addEventListener(MessageProtocol.event, (e) => {
    sent.push((e as CustomEvent).detail);
  });
  const controller = new GamePlayerController(host, {
    viewport,
    leftItems,
    locationItems,
    launchLabel: document.createElement("span"),
    connectionLabel: document.createElement("span"),
    executedLabel: document.createElement("span"),
    executionInfo: document.createElement("div"),
    routeButton,
    routeList,
  } as any);
  (controller as any)._workerGame = {};
  (controller as any)._options = { workspace: "file://proj" };
  controllers.push(controller);
  const report = (route: PreviewRoute) =>
    (controller as any).updateExecutionLabels({
      conditions: [],
      choices: [],
      state: "previewing",
      simulation: "success",
      route,
    });
  /** The host sends its pins, as it does when the player connects. */
  const hostPins = (pins: ReturnType<typeof pin>[]) =>
    (controller as any).handleSetRoutePins(
      SetRoutePinsMessage.type.request({ pins }),
    );
  const open = () =>
    routeButton.querySelector<HTMLButtonElement>(".route-button")!.click();
  /** Expand the first choice entry, which the list renders on its next
   *  pass. */
  const expand = async () => {
    routeList
      .querySelector<HTMLButtonElement>(".route-entry-toggle")!
      .click();
    await settle();
  };
  const button = (label: string, within: ParentNode = routeList) =>
    [...within.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent?.trim() === label,
    );
  const option = (text: string) =>
    [...routeList.querySelectorAll<HTMLElement>(".route-pin-option")].find(
      (o) => o.querySelector(".route-pin-option-text")?.textContent === text,
    )!;
  const requests = () =>
    sent.filter((m) => ChangeRoutePinsMessage.type.isRequest(m));
  /** The host answers the last pin request. */
  const answer = (result: { pins: ReturnType<typeof pin>[] } | "error") => {
    const request = requests().at(-1)!;
    sendProtocolMessage(
      result === "error"
        ? ChangeRoutePinsMessage.type.error(request.id, {
            code: 1,
            message: "not saved",
          })
        : ChangeRoutePinsMessage.type.response(request.id, result),
    );
  };
  return {
    controller,
    routeButton,
    routeList,
    report,
    hostPins,
    open,
    expand,
    button,
    option,
    requests,
    answer,
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  for (const controller of controllers.splice(0)) {
    (controller as any)._routeState.open = false;
    window.removeEventListener(
      "keydown",
      (controller as any).handleRouteKeyDown,
      true,
    );
  }
  document.body.replaceChildren();
});

describe("the pin control", () => {
  test("a choice entry expands to the options offered at its stop, the one taken marked, with Pin or Pinned", async () => {
    const p = player();
    await p.hostPins([pin(8)]);
    p.report(pinnedRoute());
    p.open();
    const entry = p.routeList.querySelector<HTMLElement>(
      '.route-entry[data-kind="pinned"]',
    )!;
    expect(entry.querySelector(".route-badge")!.textContent).toBe("Pinned");
    expect(p.routeList.querySelector(".route-pin-control")).toBeNull();
    entry.querySelector<HTMLButtonElement>(".route-entry-toggle")!.click();
    // The list renders the expansion on its next pass.
    await settle();
    expect(
      p.routeList.querySelector(".route-pin-sentence")!.textContent,
    ).toBe("The preview takes your pinned option here.");
    expect(
      [...p.routeList.querySelectorAll(".route-pin-option")].map((o) => [
        o.querySelector(".route-pin-option-text")!.textContent,
        o.querySelector(".route-pin-taken")?.textContent ?? "",
        o.querySelector(".route-pin-button")!.textContent,
        o.querySelector(".route-pin-button")!.getAttribute("aria-pressed"),
      ]),
    ).toEqual([
      ["Tell the truth.", "Taken", "Pinned", "true"],
      ["Show the photograph.", "", "Pin", "false"],
      ["Lie.", "", "Pin", "false"],
    ]);
    expect(p.button("Unpin")).toBeDefined();
  });

  test("pinning an option asks the host to pin it and to unpin the other pin at that stop", async () => {
    const p = player();
    await p.hostPins([pin(8)]);
    p.report(pinnedRoute());
    p.open();
    await p.expand();
    p.button("Pin", p.option("Lie."))!.click();
    const [request] = p.requests();
    expect(request!.params).toEqual({ add: [pin(12)], remove: [pin(8)] });
    // The control shows the change while the host saves it.
    expect(p.button("Pinned", p.option("Lie."))).toBeDefined();
    expect(p.button("Pin", p.option("Tell the truth."))).toBeDefined();
    p.answer({ pins: [pin(12)] });
    await settle();
    expect(p.button("Pinned", p.option("Lie."))).toBeDefined();
    expect(p.routeList.querySelector(".route-pin-note")).toBeNull();
  });

  test("Unpin and pressing Pinned remove the stop's pin", async () => {
    const p = player();
    await p.hostPins([pin(8)]);
    p.report(pinnedRoute());
    p.open();
    await p.expand();
    p.button("Unpin")!.click();
    expect(p.requests().at(-1)!.params).toEqual({ remove: [pin(8)] });
    p.answer({ pins: [pin(8)] });
    await settle();
    p.button("Pinned", p.option("Tell the truth."))!.click();
    expect(p.requests().at(-1)!.params).toEqual({ remove: [pin(8)] });
  });

  test("a host that does not save the change returns the control to its previous state with a note", async () => {
    const p = player();
    await p.hostPins([pin(8)]);
    p.report(pinnedRoute());
    p.open();
    await p.expand();
    p.button("Pin", p.option("Lie."))!.click();
    expect(p.button("Pinned", p.option("Lie."))).toBeDefined();
    p.answer("error");
    await settle();
    expect(p.button("Pin", p.option("Lie."))).toBeDefined();
    expect(p.button("Pinned", p.option("Tell the truth."))).toBeDefined();
    expect(p.routeList.querySelector(".route-pin-note")!.textContent).toBe(
      "The pin was not saved.",
    );
  });

  test("a pin that was not followed is said so in its expanded entry", async () => {
    const p = player();
    await p.hostPins([pin(12)]);
    p.report(notFollowedRoute());
    p.open();
    expect(
      p.routeList.querySelector(".route-pin-sentence")!.textContent,
    ).toBe(
      "Previewing line 11, which can't be reached through your pin, so the preview took another option here. The pin still holds for other lines.",
    );
    expect(p.button("Pinned", p.option("Lie."))).toBeDefined();
    expect(
      p.option("Show the photograph.").querySelector(".route-pin-taken")!
        .textContent,
    ).toBe("Taken");
  });

  test("Clear pins shows while any pin exists and removes every pin", async () => {
    const p = player();
    p.report(pinnedRoute());
    p.open();
    expect(p.button("Clear pins")).toBeUndefined();
    await p.hostPins([pin(8), { uri: "file://proj/other.sd", line: 3, offer: 2 }]);
    p.button("Clear pins")!.click();
    expect(p.requests().at(-1)!.params).toEqual({ removeAll: true });
  });

  test("a pin whose line holds no option is listed with Remove", async () => {
    const p = player();
    await p.hostPins([pin(8), pin(9)]);
    p.report({ ...pinnedRoute(), unresolvedPins: [pin(9)] });
    p.open();
    const unresolved = p.routeList.querySelector<HTMLElement>(
      ".route-unresolved-pin",
    )!;
    expect(unresolved.querySelector(".route-text")!.textContent).toBe(
      "Pin at line 9 of main: no option on this line",
    );
    p.button("Remove", unresolved)!.click();
    expect(p.requests().at(-1)!.params).toEqual({ remove: [pin(9)] });
  });
});

describe("the route button's pin", () => {
  test("shows when pins steered the route and nothing was forced or clipped", () => {
    const p = player();
    p.report({
      ...pinnedRoute(),
      decisions: [pinnedRoute().decisions[0]!],
    });
    expect(
      [...p.routeButton.querySelectorAll(".route-icon")].map((i) =>
        i.getAttribute("data-icon"),
      ),
    ).toEqual(["pinned"]);
    p.report(pinnedRoute());
    expect(
      [...p.routeButton.querySelectorAll(".route-icon")].map((i) =>
        i.getAttribute("data-icon"),
      ),
    ).toEqual(["forced"]);
  });
});
