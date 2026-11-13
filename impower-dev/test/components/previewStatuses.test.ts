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
const { default: workspace } = await import(
  "../../src/modules/spark-editor/workspace/WorkspaceStore"
);

let host: HTMLDivElement | undefined;

const mount = async () => {
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(808);
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(Preview, {}), host!));
};

const report = (shown: GameStatuses) =>
  act(() =>
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
        statuses: shown,
      }),
    ),
  );

const badges = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="status"][data-status]'));

const ENDED: GameStatuses = {
  completion: null,
  ending: { text: "End of story", hover: "", kind: "fin" },
};

const ERRORED: GameStatuses = {
  completion: null,
  ending: { text: "Stopped by an error", hover: "boom (line 4)", kind: "error" },
};

const PREVIEWING: GameStatuses = {
  completion: { text: "Previewing suggestion", status: "showing" },
  ending: null,
};

beforeEach(() => {
  workspaceSettings.setPreference("previewMode", "game");
  statuses.statuses.value = NO_GAME_STATUSES;
});

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  phone = false;
});

describe("the statuses over the game", () => {
  it("shows nothing over the game while the player reports no status", async () => {
    await mount();
    expect(badges()).toEqual([]);
    expect(document.querySelector("[data-preview-statuses]")).toBeNull();
  });

  it("lays the player's ending over the game's top-left corner, in its words", async () => {
    await mount();
    await report(ENDED);
    const [badge] = badges();
    expect(badge!.textContent).toBe("End of story");
    expect(badge!.dataset["status"]).toBe("ending");
    expect(badge!.dataset["statusBadge"]).toBe("default");
    const layer = badge!.parentElement!;
    expect(layer.classList).toContain("absolute");
    expect(layer.classList).toContain("top-3");
    expect(layer.classList).toContain("left-3");
    expect(layer.classList).toContain("pointer-events-none");
    expect(layer.parentElement!.querySelector('[data-stage="game"]')).not.toBeNull();
    const bar = document.querySelector('[aria-label="Problems and display"]')!;
    expect(bar.contains(badge!)).toBe(false);
  });

  it("draws an ending by an error in the error tone", async () => {
    await mount();
    await report(ERRORED);
    const [badge] = badges();
    expect(badge!.textContent).toBe("Stopped by an error");
    expect(badge!.dataset["statusBadge"]).toBe("error");
  });

  it("shows the suggestion preview's status and drops each status when the player clears it", async () => {
    await mount();
    await report(PREVIEWING);
    expect(badges().map((badge) => badge.textContent)).toEqual(["Previewing suggestion"]);
    await report({ ...PREVIEWING, ending: ENDED.ending });
    expect(badges().map((badge) => badge.textContent)).toEqual([
      "Previewing suggestion",
      "End of story",
    ]);
    await report(NO_GAME_STATUSES);
    expect(badges()).toEqual([]);
  });

  it("keeps the ending off the Interactive Fiction page but still shows a suggestion preview there", async () => {
    workspaceSettings.setPreference("previewMode", "textstream");
    await mount();
    await report({ ...PREVIEWING, ending: ENDED.ending });
    expect(badges().map((badge) => badge.dataset["status"])).toEqual(["completion"]);
  });

  it("says the game is starting while a PLAY waits for the player, and drops it once the game runs", async () => {
    const before = workspace.current;
    const setGame = (game: Record<string, unknown>) =>
      act(() => {
        workspace.current = {
          ...workspace.current,
          preview: {
            ...workspace.current.preview,
            modes: { ...workspace.current.preview.modes, game },
          },
        };
      });
    try {
      await mount();
      await setGame({ starting: true });
      const [badge] = badges();
      expect(badge!.textContent).toBe("Starting the game…");
      expect(badge!.dataset["status"]).toBe("starting");
      expect(badge!.dataset["statusBadge"]).toBe("default");
      await setGame({ running: true });
      expect(badges()).toEqual([]);
    } finally {
      workspace.current = before;
    }
  });

  it("shows the same badge over the phone's game", async () => {
    phone = true;
    await mount();
    await report(ENDED);
    expect(badges().map((badge) => badge.textContent)).toEqual(["End of story"]);
  });
});
