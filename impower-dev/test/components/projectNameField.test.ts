import { h, render, type FunctionComponent } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ finished: [] as string[], started: 0 }));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", async () => {
  const { default: workspace } =
    await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
  return {
    Workspace: {
      window: {
        startEditingProjectName: () => {
          calls.started += 1;
        },
        finishEditingProjectName: async (name: string) => {
          calls.finished.push(name);
          const previous = workspace.current.project.name;
          workspace.current = {
            ...workspace.current,
            project: {
              ...workspace.current.project,
              name: name.trim() ? name : previous,
            },
          };
          return name.trim() !== "" && name !== previous;
        },
      },
    },
  };
});

const { default: workspace } =
  await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { default: ProjectNameField } =
  await import("../../src/modules/spark-editor/components/desktop-shell/ProjectNameField");
const { default: HeaderTitleButton } =
  await import("../../src/modules/spark-editor/components/header-title-button/HeaderTitleButton");

let host: HTMLDivElement | undefined;

beforeEach(() => {
  calls.finished.length = 0;
  calls.started = 0;
  workspace.current = {
    ...workspace.current,
    project: { ...workspace.current.project, id: "local", name: "My story" },
    sync: { status: "cached" },
  };
});

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

const mount = async (component: FunctionComponent) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(component, null), host!));
  return host.querySelector<HTMLInputElement>("input")!;
};

const type = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const key = async (input: HTMLInputElement, name: string) => {
  await act(async () => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: name,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await settle();
};

const focus = async (input: HTMLInputElement) => {
  await act(async () => input.focus());
  await settle();
};

describe("the desktop project name field", () => {
  it("selects the whole name on focus", async () => {
    const input = await mount(ProjectNameField);
    expect(input.getAttribute("aria-label")).toBe("Project name");
    await focus(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe("My story".length);
    expect(calls.started).toBe(1);
  });

  it("commits the typed name on Enter", async () => {
    const input = await mount(ProjectNameField);
    await focus(input);
    await type(input, "Night shift");
    await key(input, "Enter");
    expect(calls.finished).toEqual(["Night shift"]);
    expect(workspace.current.project.name).toBe("Night shift");
    expect(input.value).toBe("Night shift");
  });

  it("restores the name on Escape without renaming", async () => {
    const input = await mount(ProjectNameField);
    await focus(input);
    await type(input, "Something else");
    await key(input, "Escape");
    expect(calls.finished).toEqual(["My story"]);
    expect(workspace.current.project.name).toBe("My story");
    expect(input.value).toBe("My story");
  });

  it("shows the previous name again after an empty or blank commit", async () => {
    const input = await mount(ProjectNameField);
    for (const empty of ["", "   "]) {
      await focus(input);
      await type(input, empty);
      await key(input, "Enter");
      expect(workspace.current.project.name).toBe("My story");
      expect(input.value).toBe("My story");
    }
  });
});

describe("the header's project name field below the desktop width", () => {
  it("shows the previous name again after an empty or blank commit", async () => {
    const input = await mount(HeaderTitleButton);
    for (const empty of ["", "   "]) {
      await focus(input);
      await type(input, empty);
      await act(async () => input.blur());
      await settle();
      expect(workspace.current.project.name).toBe("My story");
      expect(input.value).toBe("My story");
    }
  });
});
