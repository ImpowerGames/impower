import { afterEach, expect, it, vi } from "vitest";
import { GamePlayerController, setWorkspace } from "../GamePlayerController";
import { MessageProtocol, sendProtocolMessage } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { GameResizedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameResizedMessage";
import { ResizeGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/ResizeGameMessage";

const observers: (() => void)[] = [];

afterEach(() => {
  observers.length = 0;
  vi.unstubAllGlobals();
  setWorkspace(undefined as any);
});

const sized = (element: HTMLElement, size: () => { width: number; height: number }) => {
  element.getBoundingClientRect = () => {
    const { width, height } = size();
    return { x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON() {} } as DOMRect;
  };
  Object.defineProperty(element, "clientWidth", { get: () => size().width });
  Object.defineProperty(element, "clientHeight", { get: () => size().height });
  Object.defineProperty(element, "offsetWidth", { get: () => size().width });
  Object.defineProperty(element, "offsetHeight", { get: () => size().height });
};

const mount = () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private callback: () => void) {}
      observe() {
        observers.push(() => this.callback());
      }
      disconnect() {}
    },
  );
  setWorkspace({ gameLink: { detach() {} }, programHeld: async () => {} } as any);
  const host = document.createElement("div");
  const viewport = document.createElement("div");
  const game = document.createElement("div");
  const toolbar = document.createElement("div");
  viewport.append(game, toolbar);
  host.append(viewport);
  document.body.append(host);
  const pane = { width: 800, height: 628 };
  sized(viewport, () => pane);
  sized(toolbar, () => ({ width: pane.width, height: 28 }));
  sized(game, () => ({
    width: parseFloat(game.style.width) || pane.width,
    height: parseFloat(game.style.height) || pane.height - 28,
  }));
  const reports: GameResizedMessage.Notification["params"][] = [];
  host.addEventListener(MessageProtocol.event, (event) => {
    const message = (event as CustomEvent).detail;
    if (GameResizedMessage.type.isNotification(message)) {
      reports.push(message.params);
    }
  });
  const controller = new GamePlayerController(host, { viewport, game, toolbar } as any);
  controller.setup();
  const resize = () => observers.forEach((notify) => notify());
  return { host, game, pane, reports, controller, resize };
};

it("reports the rendered size and the ratio in effect after every resize", () => {
  const { host, pane, reports, controller, resize } = mount();
  try {
    reports.length = 0;
    pane.width = 960;
    pane.height = 568;
    resize();
    expect(reports.at(-1)).toEqual({ width: 960, height: 540, aspectRatio: "16:9", fit: "auto" });
    pane.width = 700;
    resize();
    expect(reports.at(-1)).toEqual({ width: 700, height: 540, aspectRatio: null, fit: "auto" });
  } finally {
    controller.dispose();
    host.remove();
  }
});

it("fits the game to a requested aspect ratio and reports the fitted size", async () => {
  const { host, game, reports, controller, resize } = mount();
  try {
    const request = ResizeGameMessage.type.request({ aspectRatio: "9:16" });
    const answered = new Promise<void>((resolve) => {
      host.addEventListener(MessageProtocol.event, (event) => {
        if (ResizeGameMessage.type.isResponse((event as CustomEvent).detail, request.id)) {
          resolve();
        }
      });
    });
    sendProtocolMessage(request);
    await answered;
    resize();
    const report = reports.at(-1)!;
    expect(report).toMatchObject({ aspectRatio: "9:16", fit: "ratio" });
    expect(report.height).toBe(600);
    expect(report.width).toBeCloseTo((600 * 9) / 16, 5);
    expect(game.getBoundingClientRect().height).toBe(600);

    const auto = ResizeGameMessage.type.request({ aspectRatio: "auto" });
    sendProtocolMessage(auto);
    await new Promise((resolve) => setTimeout(resolve));
    resize();
    expect(reports.at(-1)).toEqual({ width: 800, height: 600, aspectRatio: "4:3", fit: "auto" });
  } finally {
    controller.dispose();
    host.remove();
  }
});
