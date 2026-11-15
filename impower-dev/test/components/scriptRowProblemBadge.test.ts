import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const scripts = vi.hoisted(() => ({
  watch: vi.fn(() => () => {}),
}));
const window = vi.hoisted(() => ({
  openScript: vi.fn(),
  setListState: vi.fn(),
  navigateTo: vi.fn(),
}));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: { scripts, window },
}));

const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { default: problems } = await import("../../src/modules/spark-editor/workspace/problems/ProblemsStore");
const { default: ScriptsPage } = await import("../../src/modules/spark-editor/components/scripts-page");

const PROJECT = "p";
const facts = { modified: 1, size: 10 };

const at = (line: number) => ({
  start: { line, character: 0 },
  end: { line, character: 4 },
});
const warning = (line = 1) => ({ range: at(line), severity: 2, message: "Cannot find image" });
const error = (line = 1) => ({ range: at(line), severity: 1, message: "Unknown scene" });
const note = (line = 1) => ({ range: at(line), severity: 3, message: "A note" });

let host: HTMLDivElement | undefined;

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

const mount = async () => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(ScriptsPage, {}), host!));
  await settle();
};

const rowOf = (path: string) =>
  document.querySelector<HTMLElement>(`[data-script-path="${path}"]`)?.parentElement ?? null;
const badgeOf = (path: string) =>
  rowOf(path)?.querySelector<HTMLButtonElement>("[data-list-row-badge]") ?? null;

const setFolder = async (folder: string) => {
  workspace.current = {
    ...workspace.current,
    lists: { ...workspace.current.lists, scriptsFolder: folder },
  };
  await settle();
};

const publish = async (diagnostics: Record<string, unknown[]>) => {
  await act(async () => {
    problems.diagnostics.value = diagnostics as never;
  });
};

beforeEach(async () => {
  workspace.current = {
    ...workspace.current,
    project: { ...workspace.current.project, id: PROJECT },
    lists: { ...workspace.current.lists, scriptsFolder: "", scriptsTab: "all" },
  };
  workspace.scriptListing.value = {
    projectId: PROJECT,
    files: {
      "main.sd": facts,
      "Scripts/intro.sd": facts,
      "Scripts/outro.sd": facts,
      "Scripts/noted.sd": facts,
      "Scripts/Drafts/old.sd": facts,
    },
    folders: ["Scripts", "Scripts/Drafts"],
  };
  workspace.scriptReferences.value = [];
  problems.closeDialog();
  await publish({
    "file://local/Scripts/intro.sd": [warning(), warning(3)],
    "file://local/Scripts/outro.sd": [],
    "file://local/Scripts/noted.sd": [note()],
    "file://local/Scripts/Drafts/old.sd": [warning(), error(2)],
  });
});

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  problems.closeDialog();
});

describe("a script's problem badge on the Scripts page", () => {
  it("marks a script with only warnings with a warning and leaves clean scripts, notes and folders unmarked", async () => {
    await mount();
    const badge = badgeOf("Scripts/intro.sd");
    expect(badge?.getAttribute("data-severity")).toBe("warning");
    expect(badge?.getAttribute("aria-label")).toBe("2 warnings in intro.sd");
    expect(badgeOf("Scripts/outro.sd")).toBeNull();
    expect(badgeOf("Scripts/noted.sd")).toBeNull();
    expect(badgeOf("main.sd")).toBeNull();
    expect(badgeOf("Scripts/Drafts")).toBeNull();
    expect(rowOf("Scripts/Drafts")).not.toBeNull();
  });

  it("sits after the row's open button and before its menu", async () => {
    await mount();
    const badge = badgeOf("Scripts/intro.sd")!;
    expect(badge.previousElementSibling?.getAttribute("data-script-path")).toBe("Scripts/intro.sd");
    expect(badge.nextElementSibling?.getAttribute("aria-label")).toBe("Options for intro.sd");
  });

  it("marks a script with any error with an error inside a folder, naming every problem", async () => {
    await setFolder("Scripts/Drafts");
    await mount();
    const badge = badgeOf("Scripts/Drafts/old.sd");
    expect(badge?.getAttribute("data-severity")).toBe("error");
    expect(badge?.getAttribute("aria-label")).toBe("1 error, 1 warning in old.sd");
  });

  it("marks the pinned entry row by its shown name", async () => {
    await publish({ ...problems.diagnostics.value, "file://local/main.sd": [error()] });
    await mount();
    expect(badgeOf("main.sd")?.getAttribute("aria-label")).toBe("1 error in Main");
  });

  it("opens the Problems view scoped to that script, returning focus to the badge", async () => {
    await mount();
    const badge = badgeOf("Scripts/intro.sd")!;
    await act(async () => badge.click());
    expect(window.openScript).not.toHaveBeenCalled();
    const dialog = problems.dialog.value!;
    expect(dialog.scope).toEqual({ kind: "script", path: "Scripts/intro.sd" });
    expect(dialog.returnFocus?.()).toBe(badge);
    expect(badge.getAttribute("aria-haspopup")).toBe("dialog");
  });

  it("appears, changes and clears as the script's problems do", async () => {
    await mount();
    await publish({ ...problems.diagnostics.value, "file://local/Scripts/outro.sd": [warning()] });
    expect(badgeOf("Scripts/outro.sd")?.getAttribute("data-severity")).toBe("warning");
    await publish({ ...problems.diagnostics.value, "file://local/Scripts/outro.sd": [error()] });
    expect(badgeOf("Scripts/outro.sd")?.getAttribute("data-severity")).toBe("error");
    await publish({ ...problems.diagnostics.value, "file://local/Scripts/outro.sd": [] });
    expect(badgeOf("Scripts/outro.sd")).toBeNull();
  });

  it("follows a renamed script to its new path and drops a deleted one", async () => {
    await mount();
    await act(async () => {
      const { "Scripts/intro.sd": _, ...files } = workspace.scriptListing.value!.files;
      workspace.scriptListing.value = {
        ...workspace.scriptListing.value!,
        files: { ...files, "Scripts/opening.sd": facts },
      };
    });
    await publish({
      ...problems.diagnostics.value,
      "file://local/Scripts/intro.sd": [],
      "file://local/Scripts/opening.sd": [warning()],
    });
    expect(rowOf("Scripts/intro.sd")).toBeNull();
    expect(badgeOf("Scripts/opening.sd")?.getAttribute("aria-label")).toBe("1 warning in opening.sd");
  });
});
