import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const layout = vi.hoisted(() => ({ value: "compact" }));

vi.mock("@impower/impower-ui/layout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@impower/impower-ui/layout")>();
  return {
    ...actual,
    layoutState: { ...actual.layoutState, current: () => layout.value },
  };
});

vi.mock("../../src/modules/spark-editor/workspace/Workspace", async () => {
  const { default: workspace } = await import(
    "../../src/modules/spark-editor/workspace/WorkspaceStore"
  );
  return {
    Workspace: {
      window: {
        setStripHeight: (height: number | undefined) => {
          workspace.state.value = {
            ...workspace.state.value,
            shell: { ...workspace.state.value.shell, stripHeight: height },
          };
        },
      },
    },
  };
});

import { ProblemsStore } from "../../src/modules/spark-editor/workspace/problems/ProblemsStore";
import { Workspace } from "../../src/modules/spark-editor/workspace/Workspace";
import workspace from "../../src/modules/spark-editor/workspace/WorkspaceStore";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const strip = () => workspace.state.value.shell?.stripHeight;

describe("the compact preview strip around the Problems panel", () => {
  let store: ProblemsStore;

  beforeEach(() => {
    layout.value = "compact";
    store = new ProblemsStore();
    Workspace.window.setStripHeight(undefined);
  });

  afterEach(async () => {
    store.collapsePanel();
    await settle();
  });

  it("returns the strip to its height from before Problems opened when Problems closes", async () => {
    Workspace.window.setStripHeight(334);
    store.togglePanel();
    await settle();
    expect(strip()).toBeGreaterThan(334);
    store.togglePanel();
    await settle();
    expect(strip()).toBe(334);
  });

  it("returns a strip that had no stored height to no stored height", async () => {
    store.togglePanel();
    await settle();
    expect(strip()).toBeDefined();
    store.togglePanel();
    await settle();
    expect(strip()).toBeUndefined();
  });

  it("keeps a height the user set while Problems was open", async () => {
    Workspace.window.setStripHeight(334);
    store.togglePanel();
    await settle();
    Workspace.window.setStripHeight(700);
    store.togglePanel();
    await settle();
    expect(strip()).toBe(700);
  });
});
