import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({}));

vi.mock("../src/managers/SparkdownDebugManager", () => ({
  SparkdownDebugManager: { activate() {}, instance: {} },
}));

import { SparkDebugSession } from "../src/debugger/SparkDebugSession";

const NO_START = "no scene named start; the story starts in a scene named start";

const restart = async (answer: () => Promise<unknown>) => {
  const responses: any[] = [];
  const connection = {
    connectInput() {},
    emit: async (message: { method: string }) =>
      message.method === "game/restart" ? answer() : {},
  };
  const fileAccessor = {
    isWindows: false,
    uriToPath: (uri: string) => uri.replace("file://", ""),
    pathToUri: (path: string) => `file://${path}`,
    getRootPath: () => undefined,
  };
  const session = new SparkDebugSession(fileAccessor as any, connection as any);
  (session as any).sendResponse = (response: any) => responses.push(response);
  await (session as any).restartRequest(
    { seq: 0, type: "response", request_seq: 0, command: "restart", success: true },
    {},
  );
  return responses.at(-1)!;
};

describe("a debugger restart", () => {
  it("fails with the player's refusal when the story cannot play", async () => {
    const response = await restart(() =>
      Promise.reject({ data: "game/restart", code: 1, message: NO_START }),
    );
    expect(response.success).toBe(false);
    expect(response.message).toBe(NO_START);
  });

  it("succeeds when the player restarts the game", async () => {
    const response = await restart(async () => ({}));
    expect(response.success).toBe(true);
  });
});
