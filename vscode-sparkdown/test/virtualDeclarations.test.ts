import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ readFile: vi.fn() }));
vi.mock("vscode", () => ({
  Uri: { joinPath: (...parts: string[]) => parts.join("/") },
  workspace: { fs: { readFile: state.readFile } },
}));

describe("optional player type declarations", () => {
  it.each([
    ["FileNotFound", "Not Found"],
    ["Unknown", "Not Found"],
    ["Unknown", "Unknown (FileSystemError): Not Found"],
  ])("activates without an unhandled rejection for the optional bundle's %s response: %s", async (code, message) => {
    state.readFile.mockRejectedValue(Object.assign(new Error(message), { code }));
    const { activateVirtualDeclarations } = await import("../src/utils/activateVirtualDeclarations");
    await expect(activateVirtualDeclarations({ extensionUri: "extension", subscriptions: [] } as never)).resolves.toBeUndefined();
  });
  it("preserves other read failures", async () => {
    const error = Object.assign(new Error("Permission denied"), { code: "Unknown" });
    state.readFile.mockRejectedValue(error);
    const { activateVirtualDeclarations } = await import("../src/utils/activateVirtualDeclarations");
    await expect(activateVirtualDeclarations({ extensionUri: "extension", subscriptions: [] } as never)).rejects.toBe(error);
  });
});
