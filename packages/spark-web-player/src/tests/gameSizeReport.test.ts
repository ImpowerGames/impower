import { afterEach, expect, it, vi } from "vitest";
import { GamePlayerController, setWorkspace } from "../GamePlayerController";
import { MessageProtocol, sendProtocolMessage } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { GameResizedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameResizedMessage";
import { ResizeGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/ResizeGameMessage";

const observers: { targets: Set<Element>; notify: () => void }[] = [];

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

const mount = (options?: { resizable?: boolean }) => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      targets = new Set<Element>();
      constructor(callback: () => void) {
        observers.push({ targets: this.targets, notify: callback });
      }
      observe(target: Element) {
        this.targets.add(target);
      }
      disconnect() {
        this.targets.clear();
      }
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
  sized(game, () => {
    const scale = Number(/scale\(([^)]+)\)/.exec(game.style.transform)?.[1] ?? 1);
    return {
      width: (parseFloat(game.style.width) || pane.width) * scale,
      height: (parseFloat(game.style.height) || pane.height - 28) * scale,
    };
  });
  const reports: GameResizedMessage.Notification["params"][] = [];
  host.addEventListener(MessageProtocol.event, (event) => {
    const message = (event as CustomEvent).detail;
    if (GameResizedMessage.type.isNotification(message)) {
      reports.push(message.params);
    }
  });
  const controller = new GamePlayerController(host, { viewport, game, toolbar } as any, options);
  controller.setup();
  const resize = (...changed: Element[]) =>
    observers
      .filter(({ targets }) => changed.some((element) => targets.has(element)))
      .forEach(({ notify }) => notify());
  toolbar.setPointerCapture = () => {};
  toolbar.releasePointerCapture = () => {};
  return { host, viewport, game, toolbar, pane, reports, controller, resize };
};

it("reports the rendered size and the ratio in effect after every resize", () => {
  const { host, viewport, game, pane, reports, controller, resize } = mount();
  try {
    reports.length = 0;
    pane.width = 960;
    pane.height = 568;
    resize(viewport, game);
    expect(reports.at(-1)).toEqual({ width: 960, height: 540, aspectRatio: "16:9", fit: "auto" });
    pane.width = 700;
    resize(viewport, game);
    expect(reports.at(-1)).toEqual({ width: 700, height: 540, aspectRatio: null, fit: "auto" });
  } finally {
    controller.dispose();
    host.remove();
  }
});

it("fits the game to a requested aspect ratio and reports the fitted size", async () => {
  const { host, viewport, game, pane, reports, controller, resize } = mount();
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
    const report = reports.at(-1)!;
    expect(report).toMatchObject({ aspectRatio: "9:16", fit: "ratio" });
    expect(report.height).toBe(600);
    expect(report.width).toBeCloseTo((600 * 9) / 16, 5);
    expect(game.getBoundingClientRect().height).toBe(600);

    pane.width = 600;
    pane.height = 428;
    resize(viewport);
    expect(reports.at(-1)).toEqual({ width: 225, height: 400, aspectRatio: "9:16", fit: "ratio" });
    expect(game.getBoundingClientRect()).toMatchObject({ width: 225, height: 400 });
    pane.width = 800;
    pane.height = 628;
    resize(viewport);
    expect(reports.at(-1)).toMatchObject({ width: 337.5, height: 600, fit: "ratio" });

    const auto = ResizeGameMessage.type.request({ aspectRatio: "auto" });
    sendProtocolMessage(auto);
    await new Promise((resolve) => setTimeout(resolve));
    expect(reports.at(-1)).toEqual({ width: 800, height: 600, aspectRatio: "4:3", fit: "auto" });
  } finally {
    controller.dispose();
    host.remove();
  }
});

it("scales a letterbox shorter than the reference height and reports the letterbox", async () => {
  const { host, viewport, game, pane, reports, controller, resize } = mount();
  try {
    pane.width = 600;
    pane.height = 232;
    const request = ResizeGameMessage.type.request({ aspectRatio: "16:9" });
    const answered = new Promise<void>((resolve) => {
      host.addEventListener(MessageProtocol.event, (event) => {
        if (ResizeGameMessage.type.isResponse((event as CustomEvent).detail, request.id)) {
          resolve();
        }
      });
    });
    sendProtocolMessage(request);
    await answered;
    const scale = 204 / 720;
    expect(game.style.width).toBe(`${(204 * 16) / 9 / scale}px`);
    expect(parseFloat(game.style.width)).toBeCloseTo(1280, 5);
    expect(game.style.height).toBe(`${204 / scale}px`);
    expect(game.style.transform).toBe(`scale(${scale})`);
    expect(game.style.transformOrigin).toMatch(/^0(px)? 0(px)?$/);
    expect(parseFloat(game.style.marginRight)).toBeCloseTo(-(1280 - (204 * 16) / 9), 5);
    expect(parseFloat(game.style.marginBottom)).toBeCloseTo(-(720 - 204), 5);
    const short = reports.at(-1)!;
    expect(short).toMatchObject({ aspectRatio: "16:9", fit: "ratio" });
    expect(short.width).toBeCloseTo((204 * 16) / 9, 5);
    expect(short.height).toBeCloseTo(204, 5);

    pane.width = 1400;
    pane.height = 928;
    resize(viewport);
    expect(game.style.transform).toBe("");
    expect(game.style.marginRight).toBe("");
    expect(game.style.marginBottom).toBe("");
    expect(game.style.height).toBe(`${(1400 * 9) / 16}px`);
    expect(reports.at(-1)).toEqual({ width: 1400, height: 787.5, aspectRatio: "16:9", fit: "ratio" });

    const auto = ResizeGameMessage.type.request({ aspectRatio: "auto" });
    sendProtocolMessage(auto);
    await new Promise((resolve) => setTimeout(resolve));
    expect(game.style.transform).toBe("");
    expect(game.style.width).toBe("");
  } finally {
    controller.dispose();
    host.remove();
  }
});

it("snaps a drag that starts from a ratio fit against the width the game takes once it leaves the fit", async () => {
  const { host, toolbar, reports, controller } = mount();
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
    expect(reports.at(-1)).toMatchObject({ width: 337.5, height: 600, fit: "ratio" });
    vi.stubGlobal(
      "AudioContext",
      class {
        state = "running";
        resume() {
          return Promise.resolve();
        }
      },
    );
    const drag = (type: string, clientY: number) =>
      toolbar.dispatchEvent(new MouseEvent(type, { clientY, bubbles: true }));
    drag("pointerdown", 600);
    drag("pointermove", 340);
    drag("pointerup", 340);
    expect(reports.at(-1)).toEqual({ width: 800, height: 343, aspectRatio: "21:9", fit: "height" });
  } finally {
    controller.dispose();
    host.remove();
  }
});

it("leaves the game's size alone when the toolbar is dragged in a host that owns the display", async () => {
  const { host, toolbar, reports, controller } = mount({ resizable: false });
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
    const fitted = reports.at(-1);
    expect(fitted).toMatchObject({ width: 337.5, height: 600, fit: "ratio" });
    vi.stubGlobal(
      "AudioContext",
      class {
        state = "running";
        resume() {
          return Promise.resolve();
        }
      },
    );
    const drag = (type: string, clientY: number) =>
      toolbar.dispatchEvent(new MouseEvent(type, { clientY, bubbles: true }));
    drag("pointerdown", 600);
    drag("pointermove", 340);
    drag("pointerup", 340);
    expect(reports.at(-1)).toEqual(fitted);
  } finally {
    controller.dispose();
    host.remove();
  }
});
