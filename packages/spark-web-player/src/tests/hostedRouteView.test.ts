import { afterEach, describe, expect, test } from "vitest";
import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import type { PreviewRoute } from "@impower/spark-engine/src/game/core/types/PreviewRoute";
import { GamePlayerController } from "../GamePlayerController";
import {
  DidChangeRouteViewMessage,
  RouteViewActionMessage,
  type HostedRouteView,
  type RouteViewAction,
} from "../route/routeViewMessages";

const URI = "file://proj/main.sd";

const at = (line: number) => ({
  uri: URI,
  range: {
    start: { line: line - 1, character: 0 },
    end: { line: line - 1, character: 0 },
  },
});

const route = (): PreviewRoute => ({
  start: { scene: "interrogation", location: at(4) },
  target: at(21),
  decisions: [
    { kind: "auto", location: at(8), text: "Tell the truth.", meeting: 1 },
    { kind: "forced", location: at(15), text: "trust > 3", verdict: true },
  ],
});

const controllers: GamePlayerController[] = [];

function hostedPlayer() {
  const host = document.createElement("div");
  const viewport = document.createElement("div");
  const routeButton = document.createElement("div");
  const routeList = document.createElement("div");
  viewport.append(routeButton, routeList);
  host.append(viewport);
  document.body.append(host);
  const views: (HostedRouteView | null)[] = [];
  host.addEventListener(MessageProtocol.event, (e) => {
    const message = (e as CustomEvent).detail;
    if (DidChangeRouteViewMessage.type.isNotification(message)) {
      views.push(message.params.view);
    }
  });
  const controller = new GamePlayerController(
    host,
    { viewport, routeButton, routeList } as any,
    { hostsRoute: true },
  );
  (controller as any)._workerGame = {};
  (controller as any)._options = { workspace: "file://proj" };
  (controller as any).registerProtocolHandlers();
  controllers.push(controller);
  const report = (extra: Record<string, unknown>) =>
    (controller as any).updateExecutionLabels({
      conditions: [],
      choices: [],
      state: "previewing",
      simulation: "success",
      ...extra,
    });
  const act = (action: RouteViewAction) =>
    window.dispatchEvent(
      new CustomEvent(MessageProtocol.event, {
        detail: RouteViewActionMessage.type.notification({ action }),
      }),
    );
  return { controller, viewport, routeButton, routeList, views, report, act };
}

afterEach(() => {
  for (const controller of controllers.splice(0)) {
    controller.dispose();
  }
  document.body.replaceChildren();
});

describe("a route view the host shows", () => {
  test("is sent to the host with each report and drawn nowhere in the player", () => {
    const p = hostedPlayer();
    p.report({ route: route() });
    const view = p.views.at(-1)!;
    expect(view.route).toEqual(route());
    expect(view.open).toBe(false);
    expect(view.toggles).toEqual({ pinned: true, auto: true, forced: true, clipped: true });
    expect(view.tab).toBe("route");
    expect(p.routeButton.childElementCount).toBe(0);
    expect(p.routeList.childElementCount).toBe(0);
    expect(p.viewport.classList.contains("route-open")).toBe(false);
  });

  test("opens, closes and filters as the host asks, without opening a list in the player", () => {
    const p = hostedPlayer();
    p.report({ route: route() });
    p.act({ kind: "open" });
    expect(p.views.at(-1)!.open).toBe(true);
    expect(p.viewport.classList.contains("route-open")).toBe(false);
    expect(p.routeList.childElementCount).toBe(0);
    p.act({ kind: "toggle", routeKind: "auto", shown: false });
    expect(p.views.at(-1)!.toggles.auto).toBe(false);
    p.act({ kind: "close" });
    expect(p.views.at(-1)!.open).toBe(false);
  });

  test("switches tabs as the host asks, for the Starting values tab the host composes", () => {
    const p = hostedPlayer();
    p.report({ route: route() });
    p.act({ kind: "tab", tab: "values" });
    expect(p.views.at(-1)!.tab).toBe("values");
    p.act({ kind: "tab", tab: "route" });
    expect(p.views.at(-1)!.tab).toBe("route");
  });

  test("is withdrawn while the game plays", () => {
    const p = hostedPlayer();
    p.report({ route: route() });
    (p.controller as any)._workerPlay = {};
    p.report({ route: route(), state: "running" });
    expect(p.views.at(-1)).toBeNull();
  });

  test("sends a failed route with its reason", () => {
    const p = hostedPlayer();
    p.report({
      simulation: "fail",
      simulationFailure: "exhausted",
      startLocation: at(21),
    });
    const view = p.views.at(-1)!;
    expect(view.route).toBeUndefined();
    expect(view.failure?.target).toEqual(at(21));
  });
});
