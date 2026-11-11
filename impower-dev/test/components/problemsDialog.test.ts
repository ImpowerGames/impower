import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Diagnostic } from "vscode-languageserver-protocol";

const intents = vi.hoisted(() => ({
  revealDocument: vi.fn(),
}));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    window: { revealDocument: intents.revealDocument },
    fs: { getUriFromPath: (path: string) => `file://local/${path}` },
  },
}));

const { ProblemsDialog } = await import(
  "../../src/modules/spark-editor/components/problems"
);
const { default: problems } = await import(
  "../../src/modules/spark-editor/workspace/problems/ProblemsStore"
);

const MAIN = "file://local/main.sd";
const CHAPTER = "file://local/scripts/chapter_1.sd";

const diagnostic = (
  line: number,
  severity: 1 | 2 | 3,
  message: string,
): Diagnostic => ({
  range: { start: { line, character: 2 }, end: { line, character: 5 } },
  severity,
  message,
});

let host: HTMLDivElement | undefined;
let trigger: HTMLButtonElement;
let browse: HTMLButtonElement;

const transition = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 250));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
};

const dialog = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).find(
    (d) => d.textContent!.includes("Problems to fix"),
  );
const context = () => dialog()!.querySelector("p")!.textContent;
const headings = () =>
  Array.from(dialog()!.querySelectorAll("h3")).map((h3) => h3.textContent);
const entries = () =>
  Array.from(dialog()!.querySelectorAll("[data-message-entry] strong")).map(
    (s) => s.textContent,
  );

const open = async (scope: Parameters<typeof problems.openDialog>[0]) => {
  trigger.focus();
  await act(async () => problems.openDialog(scope, () => trigger));
};

const close = async () => {
  await act(async () =>
    dialog()!
      .querySelector<HTMLButtonElement>('[aria-label="Close dialog"]')!
      .click(),
  );
  await transition();
};

beforeEach(async () => {
  problems.diagnostics.value = {};
  problems.dialog.value = null;
  intents.revealDocument.mockClear();
  problems.record({
    uri: MAIN,
    diagnostics: [diagnostic(4, 1, "Unexpected two dots")],
  });
  problems.record({
    uri: CHAPTER,
    diagnostics: [diagnostic(1, 2, "Sound not found")],
  });
  trigger = document.body.appendChild(document.createElement("button"));
  trigger.textContent = "badge";
  browse = document.body.appendChild(document.createElement("button"));
  browse.setAttribute("data-browse-scripts", "");
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(ProblemsDialog, null), host!));
});

afterEach(async () => {
  await act(async () => problems.closeDialog());
  await transition();
  await act(async () => render(null, host!));
  document.body.innerHTML = "";
});

describe("the Problems to fix dialog", () => {
  it("lists the whole story's problems under each script's heading, with the story's counts", async () => {
    await open({ kind: "story" });
    expect(dialog()!.querySelector("h2")!.textContent).toBe("Problems to fix");
    expect(context()).toBe("Whole story · 1 error, 1 warning");
    expect(headings()).toEqual(["Mainmain.sd", "chapter_1scripts/chapter_1.sd"]);
    expect(entries()).toEqual([
      "Error · Unexpected two dots",
      "Warning · Sound not found",
    ]);
  });

  it("lists one script's problems without a heading, named in the context line", async () => {
    await open({ kind: "script", path: "scripts/chapter_1.sd" });
    expect(context()).toBe("chapter_1 · 1 warning");
    expect(headings()).toEqual([]);
    expect(entries()).toEqual(["Warning · Sound not found"]);
  });

  it("gives an entry the server can fix one 44px Fix control, and none to the others", async () => {
    const applyFix = vi.spyOn(problems, "applyFix").mockResolvedValue(true);
    const action = (name: string) => ({
      name,
      done: "Changed.",
      changes: [{ from: 0, to: 1, insert: name }],
    });
    problems.record({
      uri: CHAPTER,
      version: 2,
      diagnostics: [
        {
          ...diagnostic(1, 2, "Sound not found"),
          data: [action("Use ding instead"), action("Use dong instead")],
        },
        { ...diagnostic(3, 2, "Note"), data: [action("Remove the note")] },
      ],
    });
    await open({ kind: "story" });
    const fixes = Array.from(
      dialog()!.querySelectorAll<HTMLButtonElement>("[data-message-entry] button"),
    ).filter((button) => !button.getAttribute("aria-label"));
    expect(fixes.map((button) => button.textContent)).toEqual([
      "Fix",
      "Remove the note",
    ]);
    expect(fixes[0]!.getAttribute("aria-haspopup")).toBe("menu");
    expect(fixes.every((button) => button.classList.contains("min-h-11"))).toBe(true);
    await act(async () => fixes[1]!.click());
    expect(applyFix).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Remove the note",
        fix: expect.objectContaining({ uri: CHAPTER, version: 2 }),
      }),
    );
    applyFix.mockRestore();
  });

  it("shows the fix's Undo inside the dialog, where the keyboard can reach it", async () => {
    const { default: SnackbarHost } = await import(
      "../../src/modules/spark-editor/components/snackbar-host/SnackbarHost"
    );
    const { showSnackbar, dismissSnackbar } = await import(
      "../../src/modules/spark-editor/utils/snackbar"
    );
    const undone = vi.fn();
    const applyFix = vi.spyOn(problems, "applyFix").mockImplementation(async () => {
      showSnackbar({ message: "Changed to alice.", actionLabel: "Undo", onAction: undone });
      return true;
    });
    const toasts = document.body.appendChild(document.createElement("div"));
    await act(async () => render(h(SnackbarHost, null), toasts));
    problems.record({
      uri: CHAPTER,
      version: 2,
      diagnostics: [
        {
          ...diagnostic(1, 2, "Cannot find alcie"),
          data: [
            {
              name: "Use alice instead",
              done: "Changed to alice.",
              changes: [{ from: 0, to: 1, insert: "a" }],
            },
          ],
        },
      ],
    });
    await open({ kind: "story" });
    const fix = Array.from(
      dialog()!.querySelectorAll<HTMLButtonElement>("[data-message-entry] button"),
    ).find((button) => button.textContent === "Use alice instead")!;
    await act(async () => fix.click());
    const undo = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "Undo",
    )!;
    expect(dialog()!.contains(undo)).toBe(true);
    await act(async () => undo.click());
    expect(undone).toHaveBeenCalledTimes(1);
    applyFix.mockRestore();
    await act(async () => dismissSnackbar());
    await act(async () => render(null, toasts));
  });

  it("updates its entries as the diagnostics change", async () => {
    await open({ kind: "story" });
    await act(async () =>
      problems.record({ uri: CHAPTER, diagnostics: [] }),
    );
    expect(context()).toBe("Whole story · 1 error");
    expect(entries()).toEqual(["Error · Unexpected two dots"]);
  });

  it("returns focus to its trigger when it closes", async () => {
    await open({ kind: "story" });
    await close();
    expect(dialog()).toBeUndefined();
    expect(document.activeElement).toBe(trigger);
  });

  it("returns focus to Browse scripts when its trigger is gone", async () => {
    await open({ kind: "story" });
    trigger.remove();
    await close();
    expect(document.activeElement).toBe(browse);
  });

  it("closes and opens the script at the line on a jump, leaving focus to the script", async () => {
    await open({ kind: "story" });
    const link = dialog()!.querySelector<HTMLButtonElement>(
      '[aria-label="Open chapter_1 at line 2"]',
    )!;
    await act(async () => link.click());
    await transition();
    expect(dialog()).toBeUndefined();
    expect(problems.dialog.value).toBeNull();
    expect(intents.revealDocument).toHaveBeenCalledWith(CHAPTER, {
      start: { line: 1, character: 2 },
      end: { line: 1, character: 2 },
    });
    expect(document.activeElement).not.toBe(trigger);
  });
});
