import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  finished: 0,
  commands: [] as [string, string][],
}));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    window: {
      finishEditing: () => {
        calls.finished += 1;
      },
      executeEditorCommand: (filename: string, command: string) => {
        calls.commands.push([filename, command]);
      },
    },
  },
}));

let width = 1024;

vi.stubGlobal("matchMedia", (query: string) => {
  const list = {
    media: query,
    get matches() {
      const minWidth = /^\(min-width: (\d+)px\)$/.exec(query);
      return minWidth ? width >= Number(minWidth[1]) : false;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  return list as unknown as MediaQueryList;
});

const { default: workspace } =
  await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { stateForRoute } =
  await import("../../src/modules/spark-editor/workspace/routes");
const { default: TopBar } =
  await import("../../src/modules/spark-editor/components/desktop-shell/TopBar");

type WorkspaceCache = typeof workspace.state.value;

let host: HTMLElement | undefined;

const mount = async (route: "story" | "assets", mode: "reading" | "editing") => {
  workspace.state.value = stateForRoute(
    workspace.state.value as WorkspaceCache,
    route,
  );
  workspace.scriptMode.value = mode;
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(TopBar, null), host!));
};

const labelled = (label: string) =>
  host!.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

const projectName = () =>
  host!.querySelector(
    '.skeleton-sheen, [data-project-name], input[aria-label="Project name"]',
  );

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  calls.finished = 0;
  calls.commands.length = 0;
});

afterEach(async () => {
  await act(async () => render(null, host!));
  host?.remove();
  host = undefined;
  workspace.scriptMode.value = "reading";
});

describe("the compact top bar while a script is edited", () => {
  it("keeps the project's name and no edit controls while reading", async () => {
    await mount("story", "reading");
    expect(workspace.layout.value).toBe("compact");
    expect(projectName()).not.toBeNull();
    expect(host!.querySelector("[data-script-header-folded]")).toBeNull();
    expect(labelled("Undo edit")).toBeNull();
    expect(labelled("Redo edit")).toBeNull();
    expect(labelled("Done editing")).toBeNull();
  });

  it("folds the script header in and ends with Undo, Redo and Done editing", async () => {
    await mount("story", "editing");
    expect(projectName()).toBeNull();
    expect(host!.querySelector("[data-script-header-folded]")).not.toBeNull();
    const done = labelled("Done editing")!;
    expect(done.textContent?.trim()).toBe("Done");
    const order = [...host!.querySelectorAll("button[aria-label]")]
      .map((button) => button.getAttribute("aria-label"))
      .filter((label) =>
        ["Undo edit", "Redo edit", "Done editing"].includes(label!),
      );
    expect(order).toEqual(["Undo edit", "Redo edit", "Done editing"]);
    await act(async () => done.click());
    await settle();
    expect(calls.finished).toBe(1);
  });

  it("draws an edge-coloured divider between the app icon and the script header only while editing", async () => {
    await mount("story", "editing");
    const divider = host!.querySelector<HTMLElement>("[data-title-divider]")!;
    expect(divider).not.toBeNull();
    expect(divider.getAttribute("aria-hidden")).toBe("true");
    expect(divider.classList.contains("bg-edge")).toBe(true);
    expect(divider.classList.contains("h-6")).toBe(true);
    const folded = host!.querySelector("[data-script-header-folded]")!;
    expect(divider.nextElementSibling).toBe(folded);
    expect(divider.previousElementSibling?.querySelector("svg")).not.toBeNull();
    await act(async () => render(null, host!));
    host!.remove();
    await mount("story", "reading");
    expect(host!.querySelector("[data-title-divider]")).toBeNull();
  });

  it("shows no edit controls off the Story page", async () => {
    await mount("assets", "editing");
    expect(projectName()).not.toBeNull();
    expect(labelled("Done editing")).toBeNull();
  });

  it("leaves the desktop top bar without edit controls", async () => {
    width = 1440;
    workspace.layout.value = "desktop";
    try {
      await mount("story", "editing");
      expect(labelled("Done editing")).toBeNull();
      expect(projectName()).not.toBeNull();
    } finally {
      width = 1024;
      workspace.layout.value = "compact";
    }
  });
});
