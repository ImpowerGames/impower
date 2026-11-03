import { expect, it } from "vitest";

it("imports WorkspaceLanguageServer without a Workspace mock", async () => {
  const { default: WorkspaceLanguageServer } =
    await import("../../src/modules/spark-editor/workspace/WorkspaceLanguageServer");
  expect(WorkspaceLanguageServer).toBeTypeOf("function");
}, 60_000);
