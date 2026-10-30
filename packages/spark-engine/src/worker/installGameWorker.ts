import { isRunnableProgram } from "@impower/sparkdown/src/compiler/utils/programSummary";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { MessageConnection } from "@impower/jsonrpc/src/browser/classes/MessageConnection";
import type { Message } from "@impower/jsonrpc/src/common/types/Message";
import type { ResponseError } from "@impower/jsonrpc/src/common/types/ResponseError";
import { isNotification } from "@impower/jsonrpc/src/common/utils/isNotification";
import { isRequest } from "@impower/jsonrpc/src/common/utils/isRequest";
import { isResponse } from "@impower/jsonrpc/src/common/utils/isResponse";
import { Game } from "../game/core/classes/Game";
import { ConnectGameMessage } from "../game/core/classes/messages/ConnectGameMessage";
import { ContinueGameMessage } from "../game/core/classes/messages/ContinueGameMessage";
import { CreateGameMessage } from "../game/core/classes/messages/CreateGameMessage";
import { DestroyGameMessage } from "../game/core/classes/messages/DestroyGameMessage";
import { DisableGameDebugMessage } from "../game/core/classes/messages/DisableGameDebugMessage";
import { EnableGameDebugMessage } from "../game/core/classes/messages/EnableGameDebugMessage";
import { GetGameEvaluationContextMessage } from "../game/core/classes/messages/GetGameEvaluationContextMessage";
import { GetGamePossibleBreakpointLocationsMessage } from "../game/core/classes/messages/GetGamePossibleBreakpointLocationsMessage";
import { GetGameScriptsMessage } from "../game/core/classes/messages/GetGameScriptsMessage";
import { GetGameStackTraceMessage } from "../game/core/classes/messages/GetGameStackTraceMessage";
import { GetGameThreadsMessage } from "../game/core/classes/messages/GetGameThreadsMessage";
import { GetGameVariablesMessage } from "../game/core/classes/messages/GetGameVariablesMessage";
import { InitializedMessage } from "../game/core/classes/messages/InitializedMessage";
import { InitializeMessage } from "../game/core/classes/messages/InitializeMessage";
import { PageFramedMessage } from "../game/core/classes/messages/PageFramedMessage";
import { PauseGameMessage } from "../game/core/classes/messages/PauseGameMessage";
import { PreviewGameMessage } from "../game/core/classes/messages/PreviewGameMessage";
import { SetGameBreakpointsMessage } from "../game/core/classes/messages/SetGameBreakpointsMessage";
import { SetGameDataBreakpointsMessage } from "../game/core/classes/messages/SetGameDataBreakpointsMessage";
import { SetGameFunctionBreakpointsMessage } from "../game/core/classes/messages/SetGameFunctionBreakpointsMessage";
import { SetGameStartFromMessage } from "../game/core/classes/messages/SetGameStartFromMessage";
import { SimulateGameRouteMessage } from "../game/core/classes/messages/SimulateGameRouteMessage";
import { StartGameMessage } from "../game/core/classes/messages/StartGameMessage";
import { StepGameClockMessage } from "../game/core/classes/messages/StepGameClockMessage";
import { StepGameMessage } from "../game/core/classes/messages/StepGameMessage";
import { UnpauseGameMessage } from "../game/core/classes/messages/UnpauseGameMessage";
import { UpdateGameMessage } from "../game/core/classes/messages/UpdateGameMessage";
import type { GameConfiguration } from "../game/core/types/GameConfiguration";
import type { SystemConfiguration } from "../game/core/types/SystemConfiguration";
import { sharedNow } from "../game/core/utils/sharedClock";

export class NoGameError extends Error implements ResponseError {
  override message = "no game loaded";
  code = -32900;
}

export const PAGE_FRAME_TIMEOUT_MS = 100;

export function installGameWorker(connection: MessageConnection) {
  console.log("running spark-engine v1.0");

  const frames: {
    waiting: FrameRequestCallback[];
    timer?: number;
    paged: boolean;
  } = { waiting: [], paged: false };
  const runFrame = () => {
    if (frames.timer !== undefined) {
      self.clearTimeout(frames.timer);
      frames.timer = undefined;
    }
    const waiting = frames.waiting.splice(0);
    const now = performance.now();
    for (const callback of waiting) {
      callback(now);
    }
  };
  const runFrameOnTimer = () => {
    frames.timer = undefined;
    frames.paged = false;
    runFrame();
  };

  const systemConfiguration: SystemConfiguration = {
    now: sharedNow,
    composeBeats: true,
    setTimeout: (handler: Function, timeout?: number, ...args: any[]) =>
      self.setTimeout(handler as TimerHandler, timeout, ...args),
    requestFrame: (callback: FrameRequestCallback) => {
      const handle = frames.waiting.push(callback);
      if (frames.timer === undefined) {
        frames.timer = self.setTimeout(
          runFrameOnTimer,
          frames.paged ? PAGE_FRAME_TIMEOUT_MS : 1000 / 60,
        );
      }
      return handle;
    },
    resolve: (path: string) => {
      return path;
    },
    fetch: async (url: string): Promise<string> => {
      const response = await fetch(url);
      const text = await response.text();
      return text;
    },
    log: (message: unknown, severity: "info" | "warning" | "error") => {
      if (severity === "error") {
        console.error(message);
      } else if (severity === "warning") {
        console.warn(message);
      } else {
        console.log(message);
      }
    },
  };

  const pending: {
    debugging?: boolean;
    breakpoints?: { file: string; line: number }[];
    functionBreakpoints?: { name: string }[];
    dataBreakpoints?: { dataId: string }[];
  } = {};

  const createGame = (
    options: { program: SparkProgram } & GameConfiguration,
  ): Game => {
    const game = new Game({
      ...systemConfiguration,
      ...options,
      breakpoints: options.breakpoints ?? pending.breakpoints,
      functionBreakpoints:
        options.functionBreakpoints ?? pending.functionBreakpoints,
      dataBreakpoints: options.dataBreakpoints ?? pending.dataBreakpoints,
    });
    if (pending.debugging) {
      game.startDebugging();
    }
    return game;
  };

  const state: {
    systemConfiguration: SystemConfiguration;
    game?: Game;
    running?: Game;
    createGame: typeof createGame;
  } = {
    systemConfiguration,
    createGame,
  };

  const target = () => state.running ?? state.game;

  const games = () =>
    [state.running, state.game].filter((game): game is Game => !!game);

  connection.addEventListener("message", (e: MessageEvent) => {
    const message = e.data;
    if (PageFramedMessage.type.isNotification(message)) {
      frames.paged = true;
      runFrame();
      return;
    }
    if (isResponse(message)) {
      for (const game of games()) {
        game.connection.receive(message);
      }
    } else if (isNotification(message)) {
      target()?.connection.receive(message);
    }
    if (InitializeMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => ({}));
      connection.sendNotification(InitializedMessage.type, {});
      return;
    }
    if (DestroyGameMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => {
        if (state.game) {
          state.game.destroy();
          state.game = undefined;
        }
        return {};
      });
      return;
    }
    if (CreateGameMessage.type.isRequest(message)) {
      const { program, ...options } = message.params;
      connection.sendResponse(message, () => {
        if (state.game) {
          state.game.destroy();
        }
        state.game = createGame({ program, ...options });
        return {
          simulateFlow: state.game.simulateFlow ?? null,
          startAddress: state.game.startAddress ?? null,
        };
      });
      return;
    }
    if (UpdateGameMessage.type.isRequest(message)) {
      const { program } = message.params;
      connection.sendResponse(message, () => {
        if (!state.game) {
          throw new NoGameError();
        }
        state.game.updateProgram(program);
        return {};
      });
      return;
    }
    if (SimulateGameRouteMessage.type.isRequest(message)) {
      const { route } = message.params;
      connection.sendResponse(message, () => {
        if (!state.game) {
          throw new NoGameError();
        }
        const checkpoint = state.game.patchAndSimulateRoute(route);
        return {
          checkpoint,
        };
      });
      return;
    }
    if (ConnectGameMessage.type.isRequest(message)) {
      connection.sendResponse(message, async () => {
        if (!state.game) {
          throw new NoGameError();
        }
        await state.game.connect((msg: Message, transfer?: ArrayBuffer[]) => {
          if (isRequest(msg) || isNotification(msg)) {
            connection.postMessage(msg, transfer);
          }
        });
        return {};
      });
      return;
    }
    if (PreviewGameMessage.type.isRequest(message)) {
      const { previewFrom } = message.params;
      connection.sendResponse(message, async () => {
        if (!state.game) {
          throw new NoGameError();
        }
        return {
          previewAddress: await state.game.preview(
            previewFrom.file,
            previewFrom.line,
          ),
        };
      });
      return;
    }
    if (StartGameMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => {
        if (!state.game) {
          throw new NoGameError();
        }
        state.game.start();
        return { success: isRunnableProgram(state.game.program) };
      });
      return;
    }
    if (PauseGameMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => {
        const game = target();
        if (!game) {
          throw new NoGameError();
        }
        game.pause();
        return {};
      });
      return;
    }
    if (UnpauseGameMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => {
        const game = target();
        if (!game) {
          throw new NoGameError();
        }
        game.unpause();
        return {};
      });
      return;
    }
    if (StepGameClockMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => {
        const game = target();
        if (!game) {
          throw new NoGameError();
        }
        const { seconds } = message.params;
        game.skip(seconds);
        return {};
      });
      return;
    }
    if (StepGameMessage.type.isRequest(message)) {
      const { traversal } = message.params;
      connection.sendResponse(message, () => {
        const game = target();
        if (!game) {
          throw new NoGameError();
        }
        return { done: game.step(traversal) };
      });
      return;
    }
    if (ContinueGameMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => {
        const game = target();
        if (!game) {
          throw new NoGameError();
        }
        return { done: game.continue() };
      });
      return;
    }
    if (EnableGameDebugMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => {
        pending.debugging = true;
        target()?.startDebugging();
        return {};
      });
      return;
    }
    if (DisableGameDebugMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => {
        pending.debugging = false;
        target()?.stopDebugging();
        return {};
      });
      return;
    }
    if (SetGameBreakpointsMessage.type.isRequest(message)) {
      const { breakpoints } = message.params;
      connection.sendResponse(message, () => {
        pending.breakpoints = breakpoints;
        const game = target();
        return {
          breakpoints: game ? game.setBreakpoints(breakpoints) : [],
        };
      });
      return;
    }
    if (SetGameDataBreakpointsMessage.type.isRequest(message)) {
      const { dataBreakpoints } = message.params;
      connection.sendResponse(message, () => {
        pending.dataBreakpoints = dataBreakpoints;
        const game = target();
        return {
          dataBreakpoints: game ? game.setDataBreakpoints(dataBreakpoints) : [],
        };
      });
      return;
    }
    if (SetGameFunctionBreakpointsMessage.type.isRequest(message)) {
      const { functionBreakpoints } = message.params;
      connection.sendResponse(message, () => {
        pending.functionBreakpoints = functionBreakpoints;
        const game = target();
        return {
          functionBreakpoints: game
            ? game.setFunctionBreakpoints(functionBreakpoints)
            : [],
        };
      });
      return;
    }
    if (SetGameStartFromMessage.type.isRequest(message)) {
      const { startFrom } = message.params;
      connection.sendResponse(message, () => {
        if (!state.game) {
          throw new NoGameError();
        }
        return {
          startFrom: state.game.setStartFrom(startFrom),
        };
      });
      return;
    }
    if (GetGameEvaluationContextMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => {
        const game = target();
        if (!game) {
          throw new NoGameError();
        }
        const { threadId, frameId } = message.params;
        return { context: game.getEvaluationContext(threadId, frameId) };
      });
      return;
    }
    if (GetGamePossibleBreakpointLocationsMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => {
        const game = target();
        if (!game) {
          throw new NoGameError();
        }
        const { search } = message.params;
        return { lines: game.possibleBreakpointLines(search) };
      });
      return;
    }
    if (GetGameScriptsMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => {
        const game = target();
        if (!game) {
          throw new NoGameError();
        }
        const program = game.program;
        const uris = Object.keys(program?.scripts || {});
        return { uris };
      });
      return;
    }
    if (GetGameStackTraceMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => {
        const game = target();
        if (!game) {
          throw new NoGameError();
        }
        const { threadId, startFrame, levels } = message.params;
        return game.getStackTrace(threadId, startFrame, levels);
      });
      return;
    }
    if (GetGameThreadsMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => {
        const game = target();
        if (!game) {
          throw new NoGameError();
        }
        const threads = game.getThreads();
        return { threads };
      });
      return;
    }
    if (GetGameVariablesMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => {
        const game = target();
        if (!game) {
          throw new NoGameError();
        }
        const { scope, variablesReference, value, threadId, frameId } =
          message.params;
        if (scope === "temps") {
          const variables = game.getTempVariables(threadId, frameId);
          return { variables };
        }
        if (scope === "vars") {
          const variables = game.getVarVariables();
          return { variables };
        }
        if (scope === "defines") {
          const variables = game.getDefineVariables();
          return { variables };
        }
        if (scope === "children") {
          const variables = game.getChildVariables(
            variablesReference ?? 0,
          );
          return { variables };
        }
        if (scope === "value") {
          const variables = game.getValueVariables(value);
          return { variables };
        }
        return { variables: [] };
      });
      return;
    }
  });

  return state;
}
