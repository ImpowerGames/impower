import { describe, expect, it } from "vitest";

import { SparkDebugSession } from "../src/SparkDebugSession";

const NO_GAME = "no game loaded";

const answer = async (
  command: string,
  handler: string,
  emit: (method: string) => Promise<unknown>,
) => {
  const responses: any[] = [];
  const session = new SparkDebugSession(
    {
      isWindows: false,
      uriToPath: (uri: string) => uri,
      pathToUri: (path: string) => path,
      getRootPath: () => undefined,
    } as any,
    {
      connectInput() {},
      emit: (message: { method: string }) => emit(message.method),
    } as any,
    { syncCursorToExecution: false },
  );
  (session as any).sendResponse = (response: any) => responses.push(response);
  (session as any).sendEvent = () => {};
  await (session as any)[handler](
    { seq: 0, type: "response", request_seq: 1, command, success: true },
    { threadId: 0 },
  );
  return responses;
};

const REQUESTS = [
  ["pause", "pauseRequest", "game/pause"],
  ["continue", "continueRequest", "game/continue"],
  ["next", "nextRequest", "game/step"],
  ["stepIn", "stepInRequest", "game/step"],
  ["stepOut", "stepOutRequest", "game/step"],
  ["stackTrace", "stackTraceRequest", "game/stackTrace"],
] as const;

describe("a debugger request the player refuses", () => {
  for (const [command, handler, method] of REQUESTS) {
    it(`answers ${command} once, with the player's message, when ${method} fails`, async () => {
      const responses = await answer(command, handler, async (sent) => {
        if (sent === method) {
          throw { data: sent, code: 1, message: NO_GAME };
        }
        return { threads: [], stackFrames: [], totalFrames: 0 };
      });
      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(false);
      expect(responses[0].message).toBe(NO_GAME);
    });

    it(`answers ${command} once, successfully, when the player accepts it`, async () => {
      const responses = await answer(command, handler, async () => ({
        threads: [],
        stackFrames: [],
        totalFrames: 0,
      }));
      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
    });
  }
});
