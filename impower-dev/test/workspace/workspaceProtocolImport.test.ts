import { expect, it } from "vitest";

it("imports workspaceProtocol without a Workspace mock", async () => {
  const { registerWorkspaceProtocol } =
    await import("../../src/modules/spark-editor/workspace/workspaceProtocol");
  expect(registerWorkspaceProtocol).toBeTypeOf("function");
}, 60_000);
