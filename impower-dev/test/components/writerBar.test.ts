import type { Layout } from "@impower/impower-ui/layout";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  commands: [] as [string, string][],
  started: [] as string[],
}));
const layout = vi.hoisted(() => ({ value: "desktop" }));

vi.mock("@impower/impower-ui/layout", () => ({
  useLayout: () => layout.value,
  layoutState: { current: () => layout.value, subscribe: () => () => {} },
  useCoarsePointer: () => false,
}));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    window: {
      executeEditorCommand: (filename: string, command: string) => {
        calls.commands.push([filename, command]);
      },
      startEditing: (filename: string) => {
        calls.started.push(filename);
      },
    },
  },
}));

const { default: workspace } =
  await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { default: WriterBar } =
  await import("../../src/modules/spark-editor/components/writer-bar/WriterBar");

let host: HTMLDivElement | undefined;

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

const mount = async (filename: string) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(WriterBar, { filename }), host!));
  return host;
};

const select = async (
  panel: "main" | "scripts",
  filename: string,
  line: number,
  character: number,
) => {
  await act(async () => {
    const panes = workspace.current.panes;
    workspace.current = {
      ...workspace.current,
      panes: {
        ...panes,
        logic: {
          ...panes.logic,
          panels: {
            ...panes.logic.panels,
            [panel]: {
              ...panes.logic.panels[panel],
              activeEditor: {
                ...panes.logic.panels[panel]?.activeEditor,
                filename,
                selectedRange: {
                  start: { line: 0, character: 0 },
                  end: { line, character },
                },
              },
            },
          },
        },
      },
    } as typeof workspace.current;
  });
};

const readout = () => host!.querySelector<HTMLButtonElement>("[data-caret-position]")!;
const labelled = (label: string) =>
  host!.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

beforeEach(() => {
  calls.commands.length = 0;
  layout.value = "desktop";
  workspace.layout.value = layout.value as Layout;
  workspace.current = {
    ...workspace.current,
    project: { ...workspace.current.project, id: "local" },
  };
});

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

describe("WriterBar caret readout", () => {
  it("follows every selection change of its own script, one-based", async () => {
    await select("main", "main.sd", 0, 0);
    await mount("main.sd");
    expect(readout().textContent).toBe("Line 1, Col 1");
    await select("main", "main.sd", 11, 3);
    expect(readout().textContent).toBe("Line 12, Col 4");
    await select("main", "main.sd", 2, 0);
    expect(readout().textContent).toBe("Line 3, Col 1");
    expect(readout().getAttribute("aria-live")).toBe("off");
  });

  it("ignores the selection of the other editor", async () => {
    await select("scripts", "scripts/intro.sd", 4, 4);
    await mount("scripts/intro.sd");
    await select("main", "main.sd", 40, 0);
    expect(readout().textContent).toBe("Line 5, Col 5");
  });

  it("opens Go to line on press", async () => {
    await mount("main.sd");
    await act(async () => readout().click());
    await settle();
    expect(calls.commands).toEqual([["main.sd", "gotoLine"]]);
  });
});

describe("WriterBar tools by layout", () => {
  it("hides Indent, Dedent and Format on desktop, where the keyboard does the work", async () => {
    await mount("main.sd");
    expect(labelled("Indent")).toBeNull();
    expect(labelled("Dedent")).toBeNull();
    expect(labelled("Format script")).toBeNull();
    expect(labelled("Writing tools")).not.toBeNull();
  });

  it("shows Indent, Dedent and Format on a compact layout and sends each to the editor", async () => {
    layout.value = "compact";
    workspace.layout.value = layout.value as Layout;
    await mount("scripts/intro.sd");
    for (const label of ["Indent", "Dedent", "Format script"]) {
      await act(async () => labelled(label)!.click());
    }
    await settle();
    expect(calls.commands).toEqual([
      ["scripts/intro.sd", "indent"],
      ["scripts/intro.sd", "dedent"],
      ["scripts/intro.sd", "format"],
    ]);
    expect(host!.querySelector('[role="group"][aria-label="Indentation"]')).not.toBeNull();
  });

  it("keeps a phone's reading bar to the tools, the readout and Edit, which starts editing", async () => {
    layout.value = "phone";
    workspace.layout.value = layout.value as Layout;
    await mount("scripts/intro.sd");
    expect(labelled("Indent")).toBeNull();
    expect(labelled("Format script")).toBeNull();
    expect(labelled("Writing tools")).not.toBeNull();
    const edit = host!.querySelector<HTMLButtonElement>("[data-edit-script]")!;
    expect(edit.textContent).toContain("Edit");
    await act(async () => edit.click());
    await settle();
    expect(calls.started).toEqual(["scripts/intro.sd"]);
  });

  it("offers Add at the end of the bar", async () => {
    await mount("main.sd");
    const add = host!.querySelector<HTMLButtonElement>("[data-add-trigger]")!;
    expect(add.textContent?.trim()).toBe("Add");
    expect(add.disabled).toBe(false);
  });
});
