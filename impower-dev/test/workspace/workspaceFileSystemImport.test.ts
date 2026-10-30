import { expect, it, vi } from "vitest";

const loads = vi.hoisted(() => ({ workspace: 0 }));
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => {
  loads.workspace++;
  return { Workspace: {} };
});

it("imports WorkspaceFileSystem without loading the Workspace singleton", async () => {
  const { default: WorkspaceFileSystem } = await import(
    "../../src/modules/spark-editor/workspace/WorkspaceFileSystem"
  );
  expect(WorkspaceFileSystem).toBeTypeOf("function");
  expect(loads.workspace).toBe(0);
});
