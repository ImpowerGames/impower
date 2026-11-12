import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Diagnostic } from "vscode-languageserver-protocol";

const intents = vi.hoisted(() => ({
  revealDocument: vi.fn(),
  goBackToChoice: vi.fn(async () => true),
}));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    window: {
      revealDocument: intents.revealDocument,
      goBackToChoice: intents.goBackToChoice,
    },
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
    (d) => d.querySelector("h2") !== null,
  );
const accessibleName = () =>
  document.getElementById(dialog()!.getAttribute("aria-labelledby")!)!
    .textContent;
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
  problems.played.value = [];
  intents.revealDocument.mockClear();
  intents.goBackToChoice.mockClear();
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
    expect(context()).toBe("Whole story · 1 error, 1 warning");
    expect(headings()).toEqual(["Mainmain.sd", "chapter_1scripts/chapter_1.sd"]);
    expect(entries()).toEqual([
      "Error · Unexpected two dots",
      "Warning · Sound not found",
    ]);
  });

  it("names the whole story's dialog as the desktop panel names the same contents, visibly and to assistive technology", async () => {
    await open({ kind: "story" });
    expect(dialog()!.querySelector("h2")!.textContent).toBe(
      "Problems and playback messages",
    );
    expect(accessibleName()).toBe("Problems and playback messages");
  });

  it("names one script's dialog for the problems it lists, visibly and to assistive technology", async () => {
    await open({ kind: "script", path: "scripts/chapter_1.sd" });
    expect(dialog()!.querySelector("h2")!.textContent).toBe("Problems to fix");
    expect(accessibleName()).toBe("Problems to fix");
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

  describe("moves focus when a fix removes the entry that held it", () => {
    const fixable = (line: number, title: string) => ({
      ...diagnostic(line, 2, title),
      data: [
        {
          name: `Fix ${title}`,
          done: "Done.",
          changes: [{ from: 0, to: 1, insert: "a" }],
        },
      ],
    });

    const fixButton = (title: string) =>
      Array.from(dialog()!.querySelectorAll<HTMLButtonElement>("button")).find(
        (button) => button.textContent === `Fix ${title}`,
      )!;

    const choose = async (title: string, remaining: string[]) => {
      const applyFix = vi.spyOn(problems, "applyFix").mockResolvedValue(true);
      const button = fixButton(title);
      button.focus();
      await act(async () => button.click());
      await act(async () =>
        problems.record({
          uri: CHAPTER,
          version: 3,
          diagnostics: remaining.map((t, i) => fixable(i + 1, t)),
        }),
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      applyFix.mockRestore();
    };

    beforeEach(() => {
      problems.record({ uri: MAIN, diagnostics: [] });
      problems.record({
        uri: CHAPTER,
        version: 2,
        diagnostics: [fixable(1, "first"), fixable(2, "second"), fixable(3, "third")],
      });
    });

    it("to the next entry", async () => {
      await open({ kind: "script", path: "scripts/chapter_1.sd" });
      await choose("second", ["first", "third"]);
      expect(document.activeElement).toBe(fixButton("third"));
    });

    it("to the previous entry when it was the last", async () => {
      await open({ kind: "script", path: "scripts/chapter_1.sd" });
      await choose("third", ["first", "second"]);
      expect(document.activeElement).toBe(fixButton("second"));
    });

    it("to the previous entry when the fixed one was the last of two identical problems", async () => {
      problems.record({
        uri: CHAPTER,
        version: 2,
        diagnostics: [fixable(1, "same"), fixable(2, "same")],
      });
      await open({ kind: "script", path: "scripts/chapter_1.sd" });
      const [, last] = Array.from(dialog()!.querySelectorAll<HTMLButtonElement>("button")).filter(
        (button) => button.textContent === "Fix same",
      );
      const applyFix = vi.spyOn(problems, "applyFix").mockResolvedValue(true);
      last!.focus();
      await act(async () => last!.click());
      await act(async () =>
        problems.record({ uri: CHAPTER, version: 3, diagnostics: [fixable(1, "same")] }),
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      applyFix.mockRestore();
      expect(document.activeElement).toBe(fixButton("same"));
    });

    it("to the dialog's Close control when no entry is left", async () => {
      problems.record({ uri: CHAPTER, version: 2, diagnostics: [fixable(1, "only")] });
      await open({ kind: "script", path: "scripts/chapter_1.sd" });
      await choose("only", []);
      expect(document.activeElement?.getAttribute("aria-label")).toBe("Close dialog");
    });
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

  it("leaves focus to the script when a fix for a script no editor holds opens it from the dialog", async () => {
    await open({ kind: "story" });
    await act(async () => {
      await problems.jump({ uri: CHAPTER, line: 2, character: 2 });
    });
    await transition();
    expect(dialog()).toBeUndefined();
    expect(intents.revealDocument).toHaveBeenCalledWith(CHAPTER, {
      start: { line: 1, character: 2 },
      end: { line: 1, character: 2 },
    });
    expect(document.activeElement).not.toBe(trigger);
    expect(problems.takeLeftForScript()).toBe(false);
  });

  describe("lists what was played for the whole story", () => {
    const GO_BACK = 'button[aria-label="Go back to this choice"]';

    const cards = () =>
      dialog()!.querySelector<HTMLElement>(
        '[aria-label="While playing, variables, watches and call stack"]',
      );
    const playedRows = () =>
      Array.from(cards()!.querySelectorAll<HTMLElement>("[data-message-entry]"));

    beforeEach(() => {
      vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(2000);
      problems.run.value = 4;
      problems.recordPlayed({ severity: "info", title: "Chose · Pay.", message: "", checkpoint: 1 });
      problems.recordPlayed({ severity: "info", title: "Chose · Rest.", message: "", checkpoint: 3 });
      problems.recordPlayed({ severity: "info", title: "Chose · Walk on.", message: "", checkpoint: 3 });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("after the problems and before the debugging cards, without counting the choices as problems", async () => {
      await open({ kind: "story" });
      const list = dialog()!.querySelector("[data-problem-entry]")!;
      expect(cards()).not.toBeNull();
      expect(
        list.compareDocumentPosition(cards()!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      const heads = Array.from(
        cards()!.querySelectorAll<HTMLButtonElement>("button[aria-expanded]"),
      ).map((button) => button.getAttribute("aria-label"));
      expect(heads[0]).toBe("While playing");
      expect(heads.slice(1).map((label) => label!.split(",")[0])).toEqual([
        "Variables",
        "Watch",
        "Call stack",
      ]);
      expect(playedRows().map((row) => row.querySelector("strong")!.textContent)).toEqual([
        "Chose · Pay.",
        "Chose · Rest.",
        "Chose · Walk on.",
      ]);
      expect(entries().slice(0, 2)).toEqual([
        "Error · Unexpected two dots",
        "Warning · Sound not found",
      ]);
      expect(context()).toBe("Whole story · 1 error, 1 warning");
      expect(problems.counts.value).toEqual({ errors: 1, problems: 2, notes: 0 });
    });

    it("offers a 44px Go back to this choice on each choice the run still holds, and none on a dropped one", async () => {
      await open({ kind: "story" });
      const buttons = playedRows().map((row) => row.querySelector<HTMLButtonElement>(GO_BACK));
      expect(buttons.map(Boolean)).toEqual([true, false, true]);
      expect(buttons[0]!.className).toContain("pointer-coarse:size-11");
    });

    it("goes back to the tapped choice and closes, so the choice menu shows again, returning focus to its trigger", async () => {
      await open({ kind: "story" });
      const button = playedRows()[0]!.querySelector<HTMLButtonElement>(GO_BACK)!;
      button.focus();
      await act(async () => button.click());
      await transition();
      expect(intents.goBackToChoice).toHaveBeenCalledTimes(1);
      expect(intents.goBackToChoice).toHaveBeenCalledWith(1);
      expect(problems.dialog.value).toBeNull();
      expect(dialog()).toBeUndefined();
      expect(document.activeElement).toBe(trigger);
    });

    it("leaves a single script's dialog to its problems", async () => {
      await open({ kind: "script", path: "scripts/chapter_1.sd" });
      expect(cards()).toBeNull();
      expect(dialog()!.querySelector(GO_BACK)).toBeNull();
    });
  });
});
