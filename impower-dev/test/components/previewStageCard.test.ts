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
      setStripHeight: () => {},
    },
  },
}));

let phone = false;

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      get matches() {
        return query.includes("min-width") && !phone;
      },
      media: query,
      onchange: null,
      addEventListener: () => {},
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
  expect(frame!.parentElement!.classList).toContain("px-preview-inline");
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
    expect(frame!.parentElement!.classList).not.toContain("px-preview-inline");
  });
});
