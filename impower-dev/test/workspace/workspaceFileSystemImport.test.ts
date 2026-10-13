import { expect, it, vi } from "vitest";

// Records whether anything asks for the Workspace singleton. Workspace.ts
// constructs WorkspaceFileSystem at module load, so WorkspaceFileSystem must
// not import it back: in a shared test process that cycle let a real
// Workspace load hand out a half-evaluated module ("default is not a
// constructor" at Workspace.ts:13, #1794).
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
