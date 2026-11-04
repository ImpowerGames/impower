import { expect, it } from "vitest";

it("imports WorkspaceWindow without a Workspace mock", async () => {
  const { default: WorkspaceWindow } =
    await import("../../src/modules/spark-editor/workspace/WorkspaceWindow");
  expect(WorkspaceWindow).toBeTypeOf("function");
}, 60_000);
