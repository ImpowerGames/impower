import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const scripts = vi.hoisted(() => ({
  watch: vi.fn(() => () => {}),
  remove: vi.fn(async (_paths: string[]) => undefined),
  move: vi.fn(async (paths: string[], _folder: string) => paths),
  download: vi.fn(async (_paths: string[]) => undefined),
  duplicate: vi.fn(async () => ""),
  rename: vi.fn(async () => ""),
  create: vi.fn(async () => ""),
}));
const window = vi.hoisted(() => ({
  openScript: vi.fn(),
  setListState: vi.fn(),
  navigateTo: vi.fn(),
  openTrash: vi.fn(),
}));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: { scripts, window },
}));

const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { default: selection } = await import("../../src/modules/spark-editor/workspace/scriptsSelection");
const { default: ScriptsPage } = await import("../../src/modules/spark-editor/components/scripts-page");
const { snackbar } = await import("../../src/modules/spark-editor/utils/snackbar");

const PROJECT = "p";
const facts = { modified: 1, size: 10 };

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

const all = <T extends Element>(selector: string) => [...document.querySelectorAll<T>(selector)];
const byLabel = (label: string) => all<HTMLElement>(`[aria-label="${label}"]`)[0];
const buttonNamed = (name: string) =>
  all<HTMLButtonElement>("button").find((b) => b.textContent?.trim() === name);
const mark = (name: string) => byLabel(`Select ${name}`) as HTMLInputElement | undefined;
const rowButton = (name: string) =>
  all<HTMLButtonElement>("button").find((b) => b.getAttribute("aria-label")?.startsWith(`Open script ${name}`) || b.getAttribute("aria-label")?.startsWith(`Open folder ${name}`));

const click = async (el: HTMLElement | undefined) => {
  expect(el).toBeTruthy();
  await act(async () => el!.click());
  await settle();
};

const pick = async (...names: string[]) => {
  for (const name of names) await click(mark(name));
};

const dataTransfer = () => ({
  data: {} as Record<string, string>,
  effectAllowed: "",
  dropEffect: "",
  setData(type: string, value: string) {
    this.data[type] = value;
  },
  getData(type: string) {
    return this.data[type] ?? "";
  },
  types: ["text/plain"],
});

const dragEvent = (type: string, transfer: ReturnType<typeof dataTransfer>) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: transfer });
  return event;
};

beforeEach(() => {
  for (const fn of [...Object.values(scripts), ...Object.values(window)]) fn.mockClear();
  workspace.current = {
    ...workspace.current,
    project: { ...workspace.current.project, id: PROJECT },
  };
  workspace.scriptListing.value = {
    projectId: PROJECT,
    files: {
      "main.sd": facts,
      "Scripts/intro.sd": facts,
      "Scripts/outro.sd": facts,
      "Scripts/Drafts/old.sd": facts,
    },
    folders: ["Scripts", "Scripts/Drafts"],
  };
  workspace.scriptReferences.value = [];
  selection.end();
  snackbar.value = null;
});

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

describe("selecting scripts on the Scripts page", () => {
  it("puts the selection bar in place of the trail with the count and its actions, and never offers Main a mark", async () => {
    await mount();
    expect(byLabel("Folder path")).toBeTruthy();
    expect(mark("Main")).toBeUndefined();
    await pick("intro.sd", "outro.sd");
    expect(byLabel("Folder path")).toBeUndefined();
    expect(all('[role="status"]').some((el) => el.textContent === "2 selected")).toBe(true);
    for (const name of ["Select all", "Move…", "Download", "Delete…"]) {
      expect(buttonNamed(name), name).toBeTruthy();
    }
    expect(mark("intro.sd")!.checked).toBe(true);
  });

  it("picks instead of opening while selecting, and Select all picks every listed row but Main", async () => {
    await mount();
    await pick("intro.sd");
    await click(rowButton("outro.sd"));
    expect(window.openScript).not.toHaveBeenCalled();
    expect(all('[role="status"]').some((el) => el.textContent === "2 selected")).toBe(true);
    await click(buttonNamed("Select all"));
    expect(selection.selected.value).toEqual(["Scripts/Drafts", "Scripts/intro.sd", "Scripts/outro.sd"]);
  });

  it("leaves selection on Escape and on the bar's close", async () => {
    await mount();
    await pick("intro.sd");
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await settle();
    expect(byLabel("Folder path")).toBeTruthy();
    await pick("intro.sd");
    await click(byLabel("Stop selecting"));
    expect(byLabel("Folder path")).toBeTruthy();
    expect(selection.active.value).toBe(false);
  });

  it("deletes every picked row at once when nothing references them", async () => {
    await mount();
    await pick("intro.sd", "Drafts");
    await click(buttonNamed("Delete…"));
    expect(scripts.remove).toHaveBeenCalledWith(["Scripts/Drafts", "Scripts/intro.sd"]);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(selection.active.value).toBe(false);
  });

  it("asks first, naming the referencing scripts, when another script references a picked row", async () => {
    workspace.scriptReferences.value = [{ from: "main.sd", to: "Scripts/Drafts/old.sd", divert: true }];
    await mount();
    await pick("intro.sd", "Drafts");
    await click(buttonNamed("Delete…"));
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Delete 2 items?");
    expect(dialog.textContent).toContain("Referenced by main.sd");
    await click([...dialog.querySelectorAll("button")].find((b) => b.textContent === "Cancel"));
    expect(scripts.remove).not.toHaveBeenCalled();
    expect(selection.selected.value).toEqual(["Scripts/Drafts", "Scripts/intro.sd"]);
    await click(buttonNamed("Delete…"));
    const again = document.querySelector('[role="dialog"]')!;
    await click([...again.querySelectorAll("button")].find((b) => b.textContent === "Delete"));
    expect(scripts.remove).toHaveBeenCalledWith(["Scripts/Drafts", "Scripts/intro.sd"]);
  });

  it("asks first from the row menu's Delete too, naming the script by name", async () => {
    workspace.scriptReferences.value = [{ from: "main.sd", to: "Scripts/intro.sd", divert: true }];
    await mount();
    const options = byLabel("Options for intro.sd")!;
    await act(async () => {
      options.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "mouse" }));
    });
    await vi.waitFor(() =>
      expect(all('[role="menuitem"]').some((el) => el.textContent?.includes("Delete"))).toBe(true),
    );
    await click(all<HTMLElement>('[role="menuitem"]').find((el) => el.textContent?.includes("Delete")));
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain("Delete intro.sd?");
    expect(scripts.remove).not.toHaveBeenCalled();
  });

  it("downloads and moves every picked row", async () => {
    await mount();
    await pick("intro.sd", "outro.sd");
    await click(buttonNamed("Download"));
    expect(scripts.download).toHaveBeenCalledWith(["Scripts/intro.sd", "Scripts/outro.sd"]);
    await click(buttonNamed("Move…"));
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Move 2 items");
    await click([...dialog.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent?.includes("Drafts")));
    await click([...dialog.querySelectorAll("button")].find((b) => b.textContent === "Move here"));
    expect(scripts.move).toHaveBeenCalledWith(["Scripts/intro.sd", "Scripts/outro.sd"], "Scripts/Drafts");
  });
});

describe("dragging scripts on the Scripts page", () => {
  it("moves a row dragged onto a folder row there, and everything picked when the dragged row is picked", async () => {
    await mount();
    const transfer = dataTransfer();
    await act(async () => {
      rowButton("intro.sd")!.dispatchEvent(dragEvent("dragstart", transfer));
      rowButton("Drafts")!.dispatchEvent(dragEvent("dragover", transfer));
    });
    expect(rowButton("Drafts")!.closest("[data-drop-target]")).toBeTruthy();
    await act(async () => {
      rowButton("Drafts")!.dispatchEvent(dragEvent("drop", transfer));
    });
    await settle();
    expect(scripts.move).toHaveBeenCalledWith(["Scripts/intro.sd"], "Scripts/Drafts");

    await pick("intro.sd", "outro.sd");
    const second = dataTransfer();
    await act(async () => {
      rowButton("outro.sd")!.dispatchEvent(dragEvent("dragstart", second));
      rowButton("Drafts")!.dispatchEvent(dragEvent("drop", second));
    });
    await settle();
    expect(scripts.move).toHaveBeenLastCalledWith(["Scripts/intro.sd", "Scripts/outro.sd"], "Scripts/Drafts");
  });

  it("refuses a folder dropped onto itself with the message, never highlighting it", async () => {
    await mount();
    const transfer = dataTransfer();
    await act(async () => {
      rowButton("Drafts")!.dispatchEvent(dragEvent("dragstart", transfer));
      rowButton("Drafts")!.dispatchEvent(dragEvent("dragover", transfer));
    });
    expect(rowButton("Drafts")!.closest("[data-drop-target]")).toBeNull();
    await act(async () => {
      rowButton("Drafts")!.dispatchEvent(dragEvent("drop", transfer));
    });
    await settle();
    expect(scripts.move).not.toHaveBeenCalled();
    expect(snackbar.value?.message).toBe("A folder cannot be moved inside itself.");
  });

  it("enters selection with the row picked on a long press", async () => {
    vi.useFakeTimers();
    try {
      await act(async () => {
        host = document.body.appendChild(document.createElement("div"));
        render(h(ScriptsPage, {}), host);
      });
      const down = new MouseEvent("pointerdown", { bubbles: true, clientX: 5, clientY: 5 });
      Object.defineProperty(down, "pointerType", { value: "touch" });
      await act(async () => {
        rowButton("intro.sd")!.dispatchEvent(down);
        vi.advanceTimersByTime(600);
      });
      expect(selection.selected.value).toEqual(["Scripts/intro.sd"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
