import { afterEach, describe, expect, test } from "vitest";
import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { SetRouteTogglesMessage } from "@impower/spark-editor-protocol/src/protocols/preview/SetRouteTogglesMessage";
import type { PreviewRoute } from "@impower/spark-engine/src/game/core/types/PreviewRoute";
import { GamePlayerController } from "../GamePlayerController";
import { SIMULATION_FAILURE_MESSAGES } from "../utils/describeSimulationFailure";

const URI = "file://proj/main.sd";

const at = (line: number, uri = URI) => ({
  uri,
  range: {
    start: { line: line - 1, character: 0 },
    end: { line: line - 1, character: 0 },
  },
});

const exampleRoute = (): PreviewRoute => ({
  start: { scene: "interrogation", location: at(4) },
  target: at(21),
  decisions: [
    { kind: "auto", location: at(8), text: "Tell the truth.", meeting: 1 },
    { kind: "forced", location: at(15), text: "trust > 3", verdict: true },
    { kind: "clipped", location: at(18), text: "", verdict: false, passes: 12480 },
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
  const report = (extra: Record<string, unknown>) =>
    (controller as any).updateExecutionLabels({
      conditions: [],
      choices: [],
      state: "previewing",
      simulation: "success",
      ...extra,
    });
  const button = () =>
    routeButton.querySelector<HTMLButtonElement>(".route-button");
  const entries = () =>
    [...routeList.querySelectorAll(".route-entry")].map((e) =>
      [
        e.querySelector(".route-line")?.textContent ?? "",
        e.querySelector(".route-text")?.textContent ?? "",
        e.querySelector(".route-badge")?.textContent ?? "",
      ].join(" | "),
    );
  const toggle = (label: string) =>
    [...routeList.querySelectorAll<HTMLButtonElement>(".route-toggle")].find(
      (t) => t.textContent?.startsWith(label),
    )!;
  return {
    controller,
    viewport,
    routeButton,
    routeList,
    locationItems,
    sent,
    report,
    button,
    entries,
    toggle,
  };
}

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

describe("the route button", () => {
  test("names the scene, its first line and the target line, with the detour for a forced branch", () => {
    const p = player();
    p.report({ route: exampleRoute() });
    expect(p.routeButton.hidden).toBe(false);
    expect(p.locationItems.hidden).toBe(true);
    expect(p.button()!.textContent).toBe("interrogation (4 → 21)");
    const icons = [...p.button()!.querySelectorAll(".route-icon")];
    expect(icons.map((i) => i.getAttribute("data-icon"))).toEqual(["forced"]);
  });

  test("shows the scissors for a clipped loop and no icon for a route that runs as the game does", () => {
    const p = player();
    const clipped = exampleRoute();
    clipped.decisions = clipped.decisions.filter((d) => d.kind !== "forced");
    p.report({ route: clipped });
    expect(
      [...p.button()!.querySelectorAll(".route-icon")].map((i) =>
        i.getAttribute("data-icon"),
      ),
    ).toEqual(["clipped"]);

    p.report({
      route: { ...exampleRoute(), decisions: [exampleRoute().decisions[0]!] },
    });
    expect(p.button()!.querySelectorAll("svg.route-icon")).toHaveLength(0);
    expect(p.button()!.firstElementChild!.classList).toContain(
      "route-icon-slot",
    );
  });

  test("names the script for the top-level content and for a target in another script", () => {
    const p = player();
    p.report({
      route: {
        start: { location: at(1) },
        target: at(12, "file://proj/chapter_2.sd"),
        decisions: [],
      },
    });
    expect(p.button()!.textContent).toBe("main (1 → chapter_2 : 12)");
  });

  test("a failed route shows its label in the error colour with the warning triangle", () => {
    const p = player();
    p.report({
      simulation: "fail",
      simulationFailure: "exhausted",
      simulateFlow: "interrogation",
      simulateLocation: at(4),
      startLocation: at(21),
    });
    expect(p.button()!.classList.contains("failed")).toBe(true);
    expect(p.button()!.textContent).toBe("interrogation (4 → 21)");
    expect(
      p.button()!.querySelector(".route-icon")!.getAttribute("data-icon"),
    ).toBe("failure");
    expect(p.button()!.title).toBe(SIMULATION_FAILURE_MESSAGES.exhausted);
  });
});

describe("the route list", () => {
  test("a press opens the list below the toolbar with each decision and the target line", () => {
    const p = player();
    p.report({ route: exampleRoute() });
    expect(p.routeList.hidden).toBe(true);
    p.button()!.click();
    expect(p.routeList.hidden).toBe(false);
    expect(p.viewport.classList.contains("route-open")).toBe(true);
    expect(p.routeList.querySelector(".route-list-title")!.textContent).toBe(
      "Route to line 21",
    );
    expect(p.entries()).toEqual([
      "8 | Choice Tell the truth. | Auto",
      "15 | Condition trust > 3 forced true | Forced",
      "18 | Loop clipped after 12,480 passes | Clipped",
      "21 | Target line | ",
    ]);
  });

  test("each toggle shows its kind's count, and a toggle hides its kind and the foot counts it", () => {
    const p = player();
    p.report({ route: exampleRoute() });
    p.button()!.click();
    const counts = ["Pinned", "Auto", "Forced", "Clipped"].map(
      (label) =>
        p.toggle(label).querySelector(".route-toggle-count")!.textContent,
    );
    expect(counts).toEqual(["0", "1", "1", "1"]);
    expect(p.toggle("Forced").title).toBe(
      "Conditions the preview forced to reach the target line; the game would not go this way",
    );
    p.toggle("Auto").click();
    expect(p.toggle("Auto").getAttribute("aria-pressed")).toBe("false");
    expect(p.entries().some((e) => e.includes("Choice"))).toBe(false);
    expect(p.routeList.querySelector(".route-list-foot")!.textContent).toBe(
      "1 hidden by the toggles",
    );
    const told = p.sent.filter(
      (m) => m.method === "preview/didChangeRouteToggles",
    );
    expect(told.at(-1).params.toggles).toEqual({
      pinned: true,
      auto: false,
      forced: true,
      clipped: true,
    });
  });

  test("toggles the host sends are the ones shown", async () => {
    const p = player();
    p.report({ route: exampleRoute() });
    p.button()!.click();
    await (p.controller as any).handleSetRouteToggles(
      SetRouteTogglesMessage.type.request({ toggles: { clipped: false } }),
    );
    expect(p.toggle("Clipped").getAttribute("aria-pressed")).toBe("false");
    expect(p.entries().some((e) => e.includes("Loop clipped"))).toBe(false);
  });

  test("a press on an entry's line asks the host to show that line", () => {
    const p = player();
    p.report({ route: exampleRoute() });
    p.button()!.click();
    const link = [
      ...p.routeList.querySelectorAll<HTMLButtonElement>(".route-line"),
    ].find((l) => l.textContent === "15")!;
    link.click();
    const shown = p.sent.filter((m) => m.method === "window/showDocument");
    expect(shown).toHaveLength(1);
    expect(shown[0].params.uri).toBe(URI);
    expect(shown[0].params.selection.start.line).toBe(14);
  });

  test("a second press or Escape closes the list", () => {
    const p = player();
    p.report({ route: exampleRoute() });
    p.button()!.click();
    p.button()!.click();
    expect(p.routeList.hidden).toBe(true);
    p.button()!.click();
    expect(p.routeList.hidden).toBe(false);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(p.routeList.hidden).toBe(true);
    expect(p.viewport.classList.contains("route-open")).toBe(false);
  });

  test("a route with no decisions says the preview runs the line as the game does", () => {
    const p = player();
    p.report({ route: { ...exampleRoute(), decisions: [] } });
    p.button()!.click();
    expect(p.routeList.querySelector(".route-list-note")!.textContent).toBe(
      "The preview runs this line as the game does",
    );
  });

  test("a failed route gives the reason in place of the entries", () => {
    const p = player();
    p.report({
      simulation: "fail",
      simulationFailure: "timeout",
      simulateFlow: "interrogation",
      simulateLocation: at(4),
      startLocation: at(21),
    });
    p.button()!.click();
    expect(p.entries()).toEqual([]);
    expect(p.routeList.querySelector(".route-list-failure")!.textContent).toBe(
      SIMULATION_FAILURE_MESSAGES.timeout,
    );
  });

  test("the next preview's report keeps the list open and shows its route", () => {
    const p = player();
    p.report({ route: exampleRoute() });
    p.button()!.click();
    p.report({ route: { ...exampleRoute(), target: at(22) } });
    expect(p.routeList.hidden).toBe(false);
    expect(p.routeList.querySelector(".route-list-title")!.textContent).toBe(
      "Route to line 22",
    );
  });
});
