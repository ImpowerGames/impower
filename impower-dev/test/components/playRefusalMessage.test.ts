import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NO_START_SCENE_MESSAGE } from "@impower/sparkdown/src/compiler/utils/startScene";

const env = vi.hoisted(() => ({
  revealDocument: undefined as unknown as ReturnType<typeof import("vitest").vi.fn>,
  revealPlayRefusal: undefined as unknown as () => Promise<void>,
}));

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
      getActiveEditorForPane: () => ({ uri: MAIN }),
      revealDocument: (...args: unknown[]) => env.revealDocument(...args),
      revealPlayRefusal: () => env.revealPlayRefusal(),
    },
  },
}));

const MAIN = "file://local/main.sd";

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
const { default: StoryPreview } = await import(
  "../../src/modules/spark-editor/components/preview-strip/StoryPreview"
);
const { default: workspace } = await import(
  "../../src/modules/spark-editor/workspace/WorkspaceStore"
);
const { default: problems } = await import(
  "../../src/modules/spark-editor/workspace/problems/ProblemsStore"
);
const { default: WorkspaceWindow } = await import(
  "../../src/modules/spark-editor/workspace/WorkspaceWindow"
);

const realWindow = {
  get store() {
    return workspace.current;
  },
  _workspace: {
    fs: {
      getFileUri: (projectId: string, filename: string) =>
        `file://${projectId}/${filename}`,
    },
  },
};

const MESSAGE = `Can't play: ${NO_START_SCENE_MESSAGE}`;

let host: HTMLDivElement | undefined;
let before: typeof workspace.current;

const setGame = (game: Record<string, unknown>) =>
  act(() => {
    workspace.current = {
      ...workspace.current,
      project: { ...workspace.current.project, id: "local" },
      preview: {
        ...workspace.current.preview,
        modes: { ...workspace.current.preview.modes, game: game as never },
      },
    };
  });

const reportProblemOnFirstLine = () =>
  act(() => {
    problems.diagnostics.value = {
      [MAIN]: [
        {
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
          message: NO_START_SCENE_MESSAGE,
          severity: 1,
        },
      ],
    };
  });

const mount = async (component: typeof Preview | typeof StoryPreview) => {
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(808);
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(component, {}), host!));
};

const paneMessage = () =>
  document.querySelector<HTMLButtonElement>('[data-preview-statuses] [data-status="refusal"]');

const stripMessage = () =>
  document.querySelector<HTMLButtonElement>(
    '[data-preview-strip] [data-preview-strip-status="refusal"]',
  );

const revealedAt = () =>
  env.revealDocument.mock.calls.map(([uri, range]) => [
    uri,
    (range as { start: { line: number } }).start.line,
  ]);

beforeEach(() => {
  before = workspace.current;
  env.revealDocument = vi.fn();
  env.revealPlayRefusal = () =>
    WorkspaceWindow.prototype.revealPlayRefusal.call(realWindow as never);
  workspaceSettings.setPreference("previewMode", "game");
  problems.diagnostics.value = {};
});

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  workspace.current = before;
  problems.diagnostics.value = {};
  phone = false;
});

describe("Play refused because the story has no scene named start", () => {
  it("writes the reason in the preview, not only in a tooltip, and its press opens the entry script at the problem's line", async () => {
    await mount(Preview);
    await setGame({ playRefusal: NO_START_SCENE_MESSAGE });
    await reportProblemOnFirstLine();
    const message = paneMessage();
    expect(message).not.toBeNull();
    expect(message!.textContent).toBe(`${MESSAGE}. Go to Main, line 1`);
    expect(message!.hasAttribute("title")).toBe(false);
    await act(async () => message!.click());
    await vi.waitFor(() => expect(revealedAt()).toEqual([[MAIN, 0]]));
  });

  it("writes the reason on the phone strip, and its press opens the entry script at the problem's line", async () => {
    phone = true;
    await mount(StoryPreview);
    await setGame({ playRefusal: NO_START_SCENE_MESSAGE });
    await reportProblemOnFirstLine();
    const status = stripMessage();
    expect(status).not.toBeNull();
    expect(status!.textContent).toBe(MESSAGE);
    expect(status!.getAttribute("aria-label")).toBe(`${MESSAGE}. Go to Main, line 1`);
    await act(async () => status!.click());
    await vi.waitFor(() => expect(revealedAt()).toEqual([[MAIN, 0]]));
  });

  it("opens the entry script's first line when the problem has not reached the Problems list yet", async () => {
    await mount(Preview);
    await setGame({ playRefusal: NO_START_SCENE_MESSAGE });
    const message = paneMessage();
    expect(message!.textContent).toBe(`${MESSAGE}. Go to Main, line 1`);
    await act(async () => message!.click());
    await vi.waitFor(() => expect(revealedAt()).toEqual([[MAIN, 0]]));
  });

  it("drops the message from the preview and the strip once a start scene compiles", async () => {
    await mount(Preview);
    await setGame({ playRefusal: NO_START_SCENE_MESSAGE });
    expect(paneMessage()).not.toBeNull();
    await setGame({});
    expect(paneMessage()).toBeNull();
    await act(async () => render(null, host!));
    phone = true;
    await act(async () => render(h(StoryPreview, {}), host!));
    await setGame({ playRefusal: NO_START_SCENE_MESSAGE });
    expect(stripMessage()).not.toBeNull();
    await setGame({});
    expect(stripMessage()).toBeNull();
  });
});
