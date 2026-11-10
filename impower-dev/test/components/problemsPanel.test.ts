import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Diagnostic } from "vscode-languageserver-protocol";

const intents = vi.hoisted(() => ({
  revealDocument: vi.fn(),
  getUriFromPath: vi.fn((path: string) => `file://local/${path}`),
  setStripHeight: vi.fn(),
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
      getActiveEditorForPane: () => ({ uri: "file://local/main.sd" }),
      revealDocument: intents.revealDocument,
      setStripHeight: intents.setStripHeight,
    },
    fs: { getUriFromPath: intents.getUriFromPath },
  },
}));

let phone = false;
const mediaListeners = new Set<() => void>();

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      get matches() {
        return query.includes("min-width") ? !phone : false;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: () => void) =>
        mediaListeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) =>
        mediaListeners.delete(listener),
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const { default: workspace } = await import(
  "../../src/modules/spark-editor/workspace/WorkspaceStore"
);
const { default: workspaceSettings, PROJECT_SETTINGS_STORAGE_KEY_PREFIX } =
  await import("../../src/modules/spark-editor/workspace/settings/WorkspaceSettings");
const { default: Preview } = await import(
  "../../src/modules/spark-editor/components/preview/Preview"
);
const { default: problems } = await import(
  "../../src/modules/spark-editor/workspace/problems/ProblemsStore"
);
const { ProblemsPanel } = await import(
  "../../src/modules/spark-editor/components/problems"
);
const { consoleToggleSource, runtimeErrorSource } = await import(
  "../../src/modules/spark-editor/workspace/problems/gameSources"
);
const { snackbar } = await import("../../src/modules/spark-editor/utils/snackbar");
const { GameEncounteredRuntimeErrorMessage } = await import(
  "@impower/spark-engine/src/game/core/classes/messages/GameEncounteredRuntimeError"
);
const { RequestedEditorToolMessage } = await import(
  "@impower/spark-editor-protocol/src/protocols/editor/RequestedEditorToolMessage"
);
const { GameToggledConsoleMessage } = await import(
  "@impower/spark-engine/src/game/core/classes/messages/GameToggledConsoleMessage"
);

problems.addPlayedSource(runtimeErrorSource);
problems.addPanelSource(consoleToggleSource);

const MAIN = "file://local/main.sd";
const CHAPTER = "file://local/scripts/chapter_1.sd";
const TIME = Date.UTC(2026, 10, 6, 10, 15, 30);

const diagnostic = (
  line: number,
  severity: 1 | 2 | 3,
  message: string,
): Diagnostic => ({
  range: { start: { line, character: 4 }, end: { line, character: 9 } },
  severity,
  message,
});

const runtimeError = (
  message: string,
  type: number,
  line: number,
  state = "running",
) =>
  GameEncounteredRuntimeErrorMessage.type.notification({
    message,
    type,
    location: {
      uri: MAIN,
      range: { start: { line, character: 2 }, end: { line, character: 6 } },
    },
    state,
  } as never);

const readText = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });

const initial = structuredClone(workspace.current);
let host: HTMLDivElement | undefined;

const stored = () =>
  JSON.parse(
    localStorage.getItem(
      PROJECT_SETTINGS_STORAGE_KEY_PREFIX + workspace.current.project.id,
    ) ?? "{}",
  );

const mount = async () => {
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(2000);
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(Preview, {}), host!));
};

const settle = (ms = 0) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

const toggle = () =>
  document.querySelector<HTMLButtonElement>(
    '[aria-label="Problems and display"] > button',
  )!;
const panel = () => document.getElementById("problems-panel");
const chip = (word: string) =>
  Array.from(
    panel()!.querySelectorAll<HTMLButtonElement>("[aria-pressed]"),
  ).find((b) => b.textContent!.includes(word))!;
const head = (title: string) =>
  panel()!.querySelector<HTMLButtonElement>(`[aria-label^="${title}"]`)!;
const action = (label: string) =>
  panel()!.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
const headings = () =>
  Array.from(panel()!.querySelectorAll("h3")).map((h3) => [
    h3.querySelector("span")!.textContent,
    h3.querySelector("small")!.textContent,
  ]);
const entries = () =>
  Array.from(panel()!.querySelectorAll("[data-message-entry] strong")).map(
    (s) => s.textContent,
  );
const empties = () =>
  Array.from(panel()!.querySelectorAll('[role="listitem"] p')).map(
    (p) => p.textContent,
  );

const openPanel = async () => {
  await mount();
  await act(async () => toggle().click());
  await settle();
};

beforeEach(() => {
  localStorage.clear();
  workspace.current = structuredClone(initial);
  workspaceSettings.setProjectSetting("previewPanelHeight", 44);
  workspaceSettings.setProjectSetting("problemsScriptCardOpen", true);
  workspaceSettings.setProjectSetting("problemsPlayedCardOpen", true);
  workspaceSettings.setPreference("previewMode", "game");
  problems.diagnostics.value = {};
  problems.played.value = [];
  problems.shown.value = { error: true, warning: true, info: true };
  problems.dialog.value = null;
  problems.reveal.value = null;
  snackbar.value = null;
  Object.values(intents).forEach((fn) => fn.mockClear());
});

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  phone = false;
  await act(async () => mediaListeners.forEach((listener) => listener()));
});

describe("the Problems panel", () => {
  it("lists every script's problems grouped by script, each under its title and path", async () => {
    problems.record({
      uri: MAIN,
      diagnostics: [
        diagnostic(6, 1, "Unexpected two dots\nRemove the two dots."),
        diagnostic(1, 3, "To do: give Zadie a reason"),
      ],
    });
    problems.record({
      uri: CHAPTER,
      diagnostics: [diagnostic(2, 2, "Sound not found")],
    });
    await openPanel();
    expect(headings()).toEqual([
      ["Main", "main.sd"],
      ["chapter_1", "scripts/chapter_1.sd"],
    ]);
    expect(entries()).toEqual([
      "Note · To do: give Zadie a reason",
      "Error · Unexpected two dots",
      "Warning · Sound not found",
    ]);
    expect(panel()!.textContent).toContain("Remove the two dots.");
    expect(head("In the script").getAttribute("aria-label")).toBe(
      "In the script, 2 problems and 1 note",
    );
    expect(head("In the script").querySelector("small")!.textContent).toBe(
      "(2 problems · 1 note)",
    );
    expect(empties()).toEqual([
      "Nothing yet. Play the story and logs will appear here.",
    ]);
  });

  it("heads a single script's problems with that script", async () => {
    problems.record({ uri: CHAPTER, diagnostics: [diagnostic(2, 2, "Sound not found")] });
    await openPanel();
    expect(headings()).toEqual([["chapter_1", "scripts/chapter_1.sd"]]);
  });

  it("says there are no problems in an empty panel", async () => {
    await openPanel();
    expect(toggle().textContent).toBe("No problems");
    expect(empties()).toEqual([
      "No problems.",
      "Nothing yet. Play the story and logs will appear here.",
    ]);
  });

  it("hides a kind's entries when its filter is turned off, and says so when every kind is hidden", async () => {
    problems.record({
      uri: MAIN,
      diagnostics: [diagnostic(1, 1, "Broken"), diagnostic(2, 2, "Suspicious")],
    });
    await openPanel();
    const warnings = chip("warning");
    expect(warnings.getAttribute("aria-pressed")).toBe("true");
    expect(warnings.getAttribute("aria-label")).toBe("1 warning. Hide warnings");
    await act(async () => warnings.click());
    expect(chip("warning").getAttribute("aria-pressed")).toBe("false");
    expect(chip("warning").getAttribute("title")).toBe("Show warnings");
    expect(entries()).toEqual(["Error · Broken"]);
    await act(async () => chip("error").click());
    await act(async () => chip("note").click());
    expect(empties()[0]).toBe("Every kind is hidden. Turn one on above.");
  });

  it("opens the script at a problem's line from its link", async () => {
    problems.record({ uri: CHAPTER, diagnostics: [diagnostic(2, 2, "Sound not found")] });
    await openPanel();
    const link = panel()!.querySelector<HTMLButtonElement>(
      '[aria-label="Open chapter_1 at line 3"]',
    )!;
    expect(link.textContent).toBe("Line 3");
    await act(async () => link.click());
    await settle();
    expect(intents.revealDocument).toHaveBeenCalledWith(CHAPTER, {
      start: { line: 2, character: 4 },
      end: { line: 2, character: 4 },
    });
  });

  it("opens itself on a runtime error during play and lists it under While playing, and ignores a scrubbed preview's", async () => {
    await mount();
    await act(async () => {
      problems.receive(runtimeError("Out of songs", 1, 7, "previewing"));
    });
    expect(problems.played.value).toEqual([]);
    expect(panel()).toBeNull();
    await act(async () => {
      problems.receive(runtimeError("This line begins with `..`", 2, 4));
    });
    expect(panel()).toBeNull();
    await act(async () => {
      problems.receive(runtimeError("Out of songs\nThe jukebox is empty.", 1, 7));
    });
    await settle();
    expect(stored().previewPanelHeight).toBe(260);
    expect(entries()).toEqual([
      "Warning · This line begins with `..`",
      "Error · Out of songs",
    ]);
    expect(head("While playing").getAttribute("aria-label")).toBe(
      "While playing, 2 problems",
    );
    const link = panel()!.querySelector<HTMLButtonElement>(
      '[aria-label="Open main.sd:8"]',
    )!;
    expect(link.textContent).toBe("main.sd:8");
    await act(async () => link.click());
    await settle();
    expect(intents.getUriFromPath).toHaveBeenCalledWith("main.sd");
    expect(intents.revealDocument).toHaveBeenCalledWith(MAIN, {
      start: { line: 7, character: 0 },
      end: { line: 7, character: 0 },
    });
  });

  it("opens on In the script when the script editor asks for the problems (Ctrl+Shift+M)", async () => {
    problems.record({ uri: MAIN, diagnostics: [diagnostic(1, 1, "Broken")] });
    workspaceSettings.setProjectSetting("problemsScriptCardOpen", false);
    await mount();
    expect(panel()).toBeNull();
    await act(async () => {
      problems.receive(RequestedEditorToolMessage.type.notification({ tool: "problems" }));
    });
    await settle();
    expect(stored().previewPanelHeight).toBe(260);
    expect(stored().problemsScriptCardOpen).toBe(true);
    expect(entries()).toEqual(["Error · Broken"]);
    await act(async () => {
      problems.receive(RequestedEditorToolMessage.type.notification({ tool: "find" }));
    });
    expect(stored().previewPanelHeight).toBe(260);
  });

  it("opens and collapses from the game's console messages", async () => {
    await mount();
    await act(async () => {
      problems.receive(GameToggledConsoleMessage.type.notification({ open: true }));
    });
    await settle();
    expect(panel()).not.toBeNull();
    await act(async () => {
      problems.receive(GameToggledConsoleMessage.type.notification({ open: false }));
    });
    await settle();
    expect(panel()).toBeNull();
  });

  it("copies and saves the shown played messages in one text format, and clears them", async () => {
    await mount();
    await act(async () => {
      problems.recordPlayed(
        { severity: "error", title: "Out of songs", message: "The jukebox is empty.", path: "main.sd", line: 8 },
        TIME,
      );
      problems.recordPlayed({ severity: "info", message: "Story started" }, TIME + 1000);
    });
    await settle();
    const text =
      "[2026-11-06T10:15:30.000Z] ERROR · Out of songs\nThe jukebox is empty.\nmain.sd:8\n\n" +
      "[2026-11-06T10:15:31.000Z] INFO · Story started\n";
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    await act(async () => action("Copy the played messages").click());
    await settle();
    expect(writeText).toHaveBeenCalledWith(text);
    expect(snackbar.value?.message).toBe("Copied 2 messages.");

    const blobs: Blob[] = [];
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: (blob: Blob) => {
        blobs.push(blob);
        return "blob:played";
      },
      revokeObjectURL: () => {},
    });
    const saved: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push(this);
    });
    await act(async () => action("Save the played messages as a text file").click());
    expect(saved[0]!.download).toMatch(/^spark-played-all-2\d{3}-.+\.txt$/);
    expect(await readText(blobs[0]!)).toBe(text);

    vi.stubGlobal("navigator", { ...navigator, clipboard: undefined });
    await act(async () => action("Copy the played messages").click());
    await settle();
    expect(snackbar.value?.message).toBe(
      "Clipboard unavailable. Use Save to keep these messages.",
    );

    await act(async () => action("Clear the played messages").click());
    expect(problems.played.value).toEqual([]);
    expect(snackbar.value?.message).toBe("Played messages cleared.");
    expect(empties()).toContain("Nothing yet. Play the story and logs will appear here.");
    expect(action("Clear the played messages").disabled).toBe(true);
    expect(action("Copy the played messages").disabled).toBe(true);
  });

  it("keeps each card's open state in the project's settings", async () => {
    problems.record({ uri: MAIN, diagnostics: [diagnostic(1, 1, "Broken")] });
    await openPanel();
    await act(async () => head("In the script").click());
    expect(stored().problemsScriptCardOpen).toBe(false);
    expect(head("In the script").getAttribute("aria-expanded")).toBe("false");
    expect(entries()).toEqual([]);
    await act(async () => toggle().click());
    await settle();
    expect(panel()).toBeNull();
    await act(async () => toggle().click());
    await settle();
    expect(stored().problemsScriptCardOpen).toBe(false);
    expect(head("In the script").getAttribute("aria-expanded")).toBe("false");
    expect(entries()).toEqual([]);
  });

  it("opens the In the script card when the script header asks for the problems", async () => {
    problems.record({ uri: MAIN, diagnostics: [diagnostic(1, 1, "Broken")] });
    await openPanel();
    await act(async () => head("In the script").click());
    await act(async () => problems.showProblems());
    expect(stored().problemsScriptCardOpen).toBe(true);
    expect(entries()).toEqual(["Error · Broken"]);
  });

  describe("reveal requests", () => {
    const viewport = () =>
      panel()!.querySelector('[role="list"]')!.parentElement as HTMLElement;
    const scrollTo = (top: number) =>
      act(async () => {
        viewport().scrollTop = top;
        viewport().dispatchEvent(new Event("scroll"));
      });
    const mountShort = async () => {
      workspaceSettings.setProjectSetting("previewPanelHeight", 260);
      vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(200);
      host = document.body.appendChild(document.createElement("div"));
      await act(async () => render(h(ProblemsPanel, {}), host!));
    };

    it("scrolls back to In the script on a second request after the writer scrolled away", async () => {
      problems.record({
        uri: MAIN,
        diagnostics: Array.from({ length: 40 }, (_, line) =>
          diagnostic(line, 1, `problem ${line}`),
        ),
      });
      await mountShort();
      await act(async () => problems.showProblems());
      await settle();
      expect(viewport().scrollTop).toBe(0);
      await scrollTo(2200);
      await act(async () => problems.showProblems());
      await settle();
      expect(viewport().scrollTop).toBe(0);
    });

    it("brings a new played error into view after the full log rolls over", async () => {
      for (let index = 0; index < 100; index += 1) {
        problems.recordPlayed({ severity: "warning", message: `old ${index}` });
      }
      await mountShort();
      await act(async () =>
        problems.recordPlayed({ severity: "error", message: "first error" }),
      );
      await settle();
      const bottom = viewport().scrollTop;
      expect(bottom).toBeGreaterThan(7000);
      await scrollTo(0);
      await act(async () =>
        problems.recordPlayed({ severity: "error", message: "second error" }),
      );
      await settle();
      expect(problems.played.value).toHaveLength(100);
      expect(viewport().scrollTop).toBe(bottom);
    });

    it("leaves the writer's place alone when the rows change with no new request", async () => {
      problems.record({
        uri: MAIN,
        diagnostics: Array.from({ length: 40 }, (_, line) =>
          diagnostic(line, 1, `problem ${line}`),
        ),
      });
      for (let index = 0; index < 10; index += 1) {
        problems.recordPlayed({ severity: "warning", message: `old ${index}` });
      }
      await mountShort();
      await act(async () =>
        problems.recordPlayed({ severity: "error", message: "latest" }),
      );
      await settle();
      expect(viewport().scrollTop).toBeGreaterThan(3000);
      await scrollTo(0);
      await act(async () =>
        problems.record({
          uri: MAIN,
          diagnostics: Array.from({ length: 41 }, (_, line) =>
            diagnostic(line, 1, `problem ${line}`),
          ),
        }),
      );
      await settle();
      expect(viewport().scrollTop).toBe(0);
      await act(async () => chip("note").click());
      await settle();
      expect(viewport().scrollTop).toBe(0);
    });

    it("forgets its reveal request when the panel closes, so a later opening starts at the top", async () => {
      await mountShort();
      await act(async () =>
        problems.recordPlayed({ severity: "error", message: "latest" }),
      );
      await settle();
      expect(problems.reveal.value).not.toBeNull();
      await act(async () => render(null, host!));
      expect(problems.reveal.value).toBeNull();
    });
  });

  it("opens the whole story's Problems to fix dialog from the toggle on a phone", async () => {
    phone = true;
    await act(async () => mediaListeners.forEach((listener) => listener()));
    await mount();
    expect(toggle().getAttribute("aria-haspopup")).toBe("dialog");
    expect(toggle().hasAttribute("aria-expanded")).toBe(false);
    await act(async () => toggle().click());
    expect(problems.dialog.value?.scope).toEqual({ kind: "story" });
    expect(problems.dialog.value?.returnFocus?.()).toBe(toggle());
    expect(stored().previewPanelHeight ?? 44).toBe(44);
  });
});
