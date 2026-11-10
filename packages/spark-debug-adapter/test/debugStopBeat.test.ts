import { describe, expect, it } from "vitest";

import { DidChangeGameStateMessage } from "@impower/spark-editor-protocol/src/protocols/preview/GameStateMessage";
import { GameHitBreakpointMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameHitBreakpointMessage";
import { GameSteppedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameSteppedMessage";
import type { StoppedBeat } from "@impower/spark-engine/src/game/core/types/StoppedBeat";
import { SparkDebugSession } from "../src/SparkDebugSession";

const location = {
  uri: "file:///main.sd",
  range: { start: { line: 15, character: 0 }, end: { line: 15, character: 4 } },
};

const playing = DidChangeGameStateMessage.type.notification({
  mounted: true,
  programLoaded: true,
  programVersion: 1,
  launchState: "play",
  paused: false,
  stepping: false,
  ending: null,
  run: 1,
  position: null,
  completion: null,
});

const session = () => {
  const bodies: unknown[] = [];
  const connection = {
    connectInput() {},
    emit: async (message: { method: string }) => {
      if (message.method === "preview/gameState") {
        return playing.params;
      }
      return message.method === "game/threads"
        ? { threads: [{ id: 0, name: "main" }], run: 1 }
        : { run: 1, done: false };
    },
  };
  const fileAccessor = {
    isWindows: false,
    showFile: async () => {},
    uriToPath: (uri: string) => uri.replace("file://", ""),
    pathToUri: (path: string) => `file://${path}`,
    getRootPath: () => undefined,
  };
  const s = new SparkDebugSession(fileAccessor as any, connection as any, {
    syncCursorToExecution: true,
  });
  (s as any).sendEvent = (event: any) => {
    if (event.event === "stopped") {
      bodies.push(event.body);
    }
  };
  return {
    bodies,
    notify: (message: unknown) => (s as any).onReceiveNotification(message),
  };
};

describe("the debug adapter reporting whether a stop's beat is on screen", () => {
  for (const beat of ["shown", "held", "none"] as StoppedBeat[]) {
    it(`copies beat ${beat} from game/stepped onto the stopped event`, async () => {
      const s = session();
      await s.notify(playing);
      await s.notify(
        GameSteppedMessage.type.notification({ location, run: 1, beat }),
      );
      expect(s.bodies).toEqual([{ reason: "step", threadId: 0, beat }]);
    });

    it(`copies beat ${beat} from game/hitBreakpoint onto the stopped event`, async () => {
      const s = session();
      await s.notify(playing);
      await s.notify(
        GameHitBreakpointMessage.type.notification({ location, run: 1, beat }),
      );
      expect(s.bodies).toEqual([{ reason: "breakpoint", threadId: 0, beat }]);
    });
  }
});
