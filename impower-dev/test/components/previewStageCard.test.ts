import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DidChangeGameStateMessage,
  type GameStatuses,
} from "@impower/spark-editor-protocol/src/protocols/preview/GameStateMessage";

vi.mock("../../src/modules/spark-editor/components/preview-game/PreviewGame", () => ({
  default: () => h("div", { "data-stage": "game" }),
}));
vi.mock(
  "../../src/modules/spark-editor/components/preview-screenplay/PreviewScreenplay",
  () => ({ default: () => h("div", { "data-stage": "screenplay" }) }),
);
vi.mock(
  "../../src/modules/spark-editor/components/preview-top-bar/PreviewTopBar",
  () => ({ default: () => h("div", { "data-top-bar": "" }) }),
);
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    window: {
      getActiveEditorForPane: () => ({ uri: "file:///local/main.sd" }),
      revealDocument: () => {},
    },
  },
}));

let phone = false;
const mediaListeners = new Set<() => void>();

const setPhone = async (value: boolean) => {
  phone = value;
  await act(async () => {
    mediaListeners.forEach((listener) => listener());
  });
};

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      get matches() {
        return query.includes("min-width") && !phone;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: () => void) => {
        mediaListeners.add(listener);
      },
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  HTMLElement.prototype.setPointerCapture ??= () => {};
  HTMLElement.prototype.releasePointerCapture ??= () => {};
});

const { default: workspaceSettings } = await import(
  "../../src/modules/spark-editor/workspace/settings/WorkspaceSettings"
);
const { default: Preview } = await import(
  "../../src/modules/spark-editor/components/preview/Preview"
);
const { default: workspace } = await import(
  "../../src/modules/spark-editor/workspace/WorkspaceStore"
);
const { PreviewStrip } = await import("@impower/impower-ui/components");
const { default: statuses, NO_GAME_STATUSES } = await import(
  "../../src/modules/spark-editor/workspace/statuses/StatusesStore"
);

let host: HTMLDivElement | undefined;

const mount = async () => {
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(808);
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(Preview, {}), host!));
};

const ENDED: GameStatuses = {
  completion: null,
  ending: { text: "End of story", hover: "", kind: "fin" },
};

const card = () => document.querySelector<HTMLElement>("[data-preview-card]");

const expectInsetCard = () => {
  const frame = card();
  expect(frame).not.toBeNull();
  expect(frame!.classList).toContain("rounded-preview-frame");
  expect(frame!.classList).toContain("overflow-hidden");
  expect(frame!.classList).not.toContain("shadow-preview-frame");
  expect(frame!.classList).toContain("bg-preview-frame-fill");
  expect(frame!.classList).not.toContain("bg-stage");
  expect(frame!.parentElement!.classList).toContain("px-preview-inline");
  expect(frame!.parentElement!.classList).toContain("pt-preview-stage-gap");
  expect((host!.firstElementChild as HTMLElement).classList).toContain("bg-preview-mat");
  expect(frame!.querySelector('[data-stage="game"]')).not.toBeNull();
};

beforeEach(() => {
  phone = false;
  workspaceSettings.setPreference("previewMode", "game");
  statuses.statuses.value = NO_GAME_STATUSES;
});

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  delete (document as { fullscreenElement?: Element }).fullscreenElement;
  vi.restoreAllMocks();
});

describe("the preview stage's game card", () => {
  it("insets the game from the pane's sides and rounds its corners at desktop widths", async () => {
    await mount();
    expectInsetCard();
    const panel = card()!.closest<HTMLElement>("[data-panel]");
    expect(panel?.dataset["panel"]).toBe("start");
    expect(panel!.classList).toContain("overflow-visible");
    expect(panel!.classList).not.toContain("overflow-hidden");
  });

  it("insets and rounds the game on a phone, as the prototype's phone player does", async () => {
    phone = true;
    await mount();
    expectInsetCard();
  });

  it("keeps the status badge over the game inside the card", async () => {
    await mount();
    await act(() =>
      statuses.receive(
        DidChangeGameStateMessage.type.notification({
          mounted: true,
          programLoaded: true,
          programVersion: 1,
          launchState: "ended",
          paused: false,
          stepping: false,
          run: 1,
          position: null,
          completion: null,
          ending: null,
          statuses: ENDED,
        }),
      ),
    );
    const badge = document.querySelector('[role="status"][data-status]');
    expect(badge).not.toBeNull();
    expect(card()!.contains(badge)).toBe(true);
  });

  it("drops the inset and the rounding in fullscreen", async () => {
    await mount();
    const pane = host!.firstElementChild as HTMLElement;
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => pane,
    });
    await act(async () => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    const frame = card();
    expect(frame).not.toBeNull();
    expect(frame!.classList).not.toContain("rounded-preview-frame");
    expect(frame!.classList).not.toContain("shadow-preview-frame");
    expect(frame!.parentElement!.classList).not.toContain("px-preview-inline");
    expect(frame!.parentElement!.classList).not.toContain("pt-preview-stage-gap");
  });

  it("keeps the full view's bars and inset card on a phone while the strip fades it out, and drops them once it has closed", async () => {
    await setPhone(true);
    const dialogProto = HTMLDialogElement.prototype as HTMLDialogElement & {
      showModal?: () => void;
      close?: () => void;
    };
    if (typeof dialogProto.showModal !== "function") {
      dialogProto.showModal = function (this: HTMLDialogElement) {
        this.setAttribute("open", "");
      };
    }
    if (typeof dialogProto.close !== "function") {
      dialogProto.close = function (this: HTMLDialogElement) {
        this.removeAttribute("open");
      };
    }
    const revealed = workspace.current.preview.revealed;
    const reveal = (value: typeof revealed) => {
      workspace.current = {
        ...workspace.current,
        preview: { ...workspace.current.preview, revealed: value },
      };
    };
    const strip = (expanded: boolean) => {
      reveal(expanded);
      return h(PreviewStrip, { label: "ACTION", words: "Rain.", expanded, picture: h(Preview, {}) });
    };
    const topBar = () => document.querySelector("[data-top-bar]");
    const close = () => document.querySelector('button[aria-label="Close the preview"]');
    try {
      host = document.body.appendChild(document.createElement("div"));
      await act(async () => render(strip(true), host!));
      const dialog = host.querySelector("dialog")!;
      expect(dialog.open).toBe(true);
      expect(topBar()).not.toBeNull();
      expect(card()!.classList).toContain("rounded-preview-frame");
      Object.defineProperty(dialog, "getAnimations", {
        configurable: true,
        value: () => [
          { playState: "running", animationName: "fade-out", effect: { pseudoElement: null } },
        ],
      });
      await act(async () => render(strip(false), host!));
      expect(dialog.open).toBe(true);
      expect(topBar()).not.toBeNull();
      expect(close()).not.toBeNull();
      expect(card()!.classList).toContain("rounded-preview-frame");
      const end = new Event("animationend");
      Object.defineProperty(end, "animationName", { value: "fade-out" });
      Object.defineProperty(end, "pseudoElement", { value: "" });
      await act(async () => {
        dialog.dispatchEvent(end);
      });
      expect(dialog.open).toBe(false);
      expect(topBar()).toBeNull();
      expect(close()).toBeNull();
      expect(card()!.classList).not.toContain("rounded-preview-frame");
    } finally {
      await setPhone(false);
      reveal(revealed);
    }
  });
});
