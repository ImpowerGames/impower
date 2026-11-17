import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const scripts = vi.hoisted(() => ({
  watch: vi.fn(() => () => {}),
  remove: vi.fn(async (_paths: string[]) => undefined),
  referencing: vi.fn(async (_paths: string[]): Promise<string[] | null> => []),
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

const PROJECT = "p";
const facts = { modified: 1, size: 10 };

const ICONS: Record<string, string> = {
  Select: '<rect x="3" y="3" width="18" height="18" rx="4"></rect><path d="m8 12 3 3 5-6"></path>',
  Rename: '<path d="m4 16 12-12 4 4L8 20H4zM14 6l4 4"></path>',
  "Move…": '<path d="M3 7V5h7l2 2h9v13H3z"></path>',
  Duplicate: '<path d="M9 9h12v12H9zM15 9V3H3v12h6"></path>',
  Download: '<path d="M12 3v12m-5-5 5 5 5-5M4 21h16"></path>',
  Delete: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"></path>',
};

let host: HTMLDivElement | undefined;

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

const all = <T extends Element>(selector: string) => [...document.querySelectorAll<T>(selector)];

const open = async (name: string, pointerType: "mouse" | "touch") => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(ScriptsPage, {}), host!));
  await settle();
  const trigger = all<HTMLElement>(`button[aria-label="Options for ${name}"]`)[0];
  expect(trigger).toBeTruthy();
  await act(async () => {
    trigger!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType, button: 0 }));
    if (pointerType === "touch") {
      trigger!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
    }
  });
  await settle();
  return vi.waitFor(() => {
    const items = all<HTMLElement>('[role="menuitem"]');
    expect(items.length).toBeGreaterThan(0);
    return items;
  });
};

beforeEach(() => {
  workspace.current = {
    ...workspace.current,
    project: { ...workspace.current.project, id: PROJECT },
    lists: { ...workspace.current.lists, scriptsFolder: "" },
  };
  workspace.scriptListing.value = {
    projectId: PROJECT,
    files: { "main.sd": facts, "Scripts/intro.sd": facts },
    folders: ["Scripts"],
  };
  workspace.scriptReferences.value = [];
});

afterEach(async () => {
  selection.end();
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

describe("the Scripts page's row menu matches the prototype's entries and glyphs (I-2518, I-2521)", () => {
  for (const pointerType of ["mouse", "touch"] as const) {
    it(`draws Rename with the plain pencil and every glyph muted, Delete's text alone in the error colour, under ${pointerType}`, async () => {
      workspace.current = { ...workspace.current, lists: { ...workspace.current.lists, scriptsFolder: "Scripts" } };
      const items = await open("intro.sd", pointerType);
      expect(items.map((item) => item.textContent?.trim())).toEqual(Object.keys(ICONS));
      for (const item of items) {
        const label = item.textContent!.trim();
        const glyph = item.querySelector("svg")!;
        expect(glyph.innerHTML).toBe(ICONS[label]);
        expect(glyph.getAttribute("class") ?? "").toContain("text-muted");
        expect((item.getAttribute("class") ?? "").includes("text-error")).toBe(label === "Delete");
      }
      expect(all('[role="separator"]')).toEqual([]);
    });

    it(`starts selecting with the row picked when Select is chosen under ${pointerType} (I-2521)`, async () => {
      workspace.current = { ...workspace.current, lists: { ...workspace.current.lists, scriptsFolder: "Scripts" } };
      const items = await open("intro.sd", pointerType);
      const select = items.find((item) => item.textContent?.trim() === "Select")!;
      expect(select).toBeTruthy();
      await act(async () => select.click());
      await settle();
      expect(selection.active.value).toBe(true);
      expect(selection.selected.value).toEqual(["Scripts/intro.sd"]);
      const box = document.querySelector<HTMLInputElement>('[aria-label="Select intro.sd"]');
      expect(box?.getAttribute("aria-checked") ?? String(box?.checked)).toBe("true");
    });
  }

  it("keeps Main's menu to Duplicate and Download, both muted, with no separator", async () => {
    const items = await open("Main", "mouse");
    expect(items.map((item) => item.textContent?.trim())).toEqual(["Duplicate", "Download"]);
    expect(all('[role="separator"]')).toEqual([]);
    for (const item of items) {
      expect(item.querySelector("svg")!.getAttribute("class") ?? "").toContain("text-muted");
    }
  });
});
