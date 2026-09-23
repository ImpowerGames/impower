import { hasCompiledProgram } from "@impower/sparkdown/src/binary/programBinary";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import type { Story } from "@impower/sparkdown/src/inkjs/engine/Story";
import { MessageConnection } from "@impower/jsonrpc/src/browser/classes/MessageConnection";
import type { Message } from "@impower/jsonrpc/src/common/types/Message";
import type { ResponseError } from "@impower/jsonrpc/src/common/types/ResponseError";
import { isNotification } from "@impower/jsonrpc/src/common/utils/isNotification";
import { isRequest } from "@impower/jsonrpc/src/common/utils/isRequest";
import { isResponse } from "@impower/jsonrpc/src/common/utils/isResponse";
import { Game } from "../game/core/classes/Game";
import { possibleBreakpointLines } from "../game/core/utils/possibleBreakpointLines";
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

export function installGameWorker(connection: MessageConnection) {
  console.log("running spark-engine v1.0");

  const systemConfiguration: SystemConfiguration = {
    now: sharedNow,
    // Called as methods of this configuration, which a browser refuses for
    // the global's own functions ("Illegal invocation"), so each is called
    // on the global here.
    setTimeout: (handler: Function, timeout?: number, ...args: any[]) =>
      self.setTimeout(handler as TimerHandler, timeout, ...args),
    requestFrame: (callback: FrameRequestCallback) =>
      self.requestAnimationFrame(callback),
    resolve: (path: string) => {
      // TODO: resolve import and load paths to url
      return path;
    },
    fetch: async (url: string): Promise<string> => {
      const response = await fetch(url);
      const text = await response.text();
      return text;
      // TODO: Differentiate between script text response and asset blob response
      // const buffer = await response.arrayBuffer();
      // return buffer;
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

  // What the editor last asked of the debugger, which every game built here
  // starts with. Until there is a game, a setter records the request and
  // resolves no breakpoint: only a game's program can say where one lands,
  // as a host that owns its game answers with none before it has one.
  const pending: {
    debugging?: boolean;
    breakpoints?: { file: string; line: number }[];
    functionBreakpoints?: { name: string }[];
    dataBreakpoints?: { dataId: string }[];
  } = {};

  /** Build a game for this worker to hold, with its system configuration
   *  and with what the editor has asked of the debugger so far, as a host
   *  that owns its game gives each game it builds the same settings. Every
   *  game this worker holds is built here. */
  const createGame = (
    options: { program: SparkProgram; story?: Story } & GameConfiguration,
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
    createGame: typeof createGame;
  } = {
    systemConfiguration,
    createGame,
  };

  connection.addEventListener("message", (e: MessageEvent) => {
    const message = e.data;
    if (isResponse(message) || isNotification(message)) {
      // Receive responses and notifications
      if (state.game) {
        state.game.connection.receive(message);
      }
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
          simulatePath: state.game.simulatePath,
          startPath: state.game.startPath,
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
            // Forward requests and notifications
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
          previewPath: await state.game.preview(
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
        return { success: hasCompiledProgram(state.game.program) };
      });
      return;
    }
    if (PauseGameMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => {
        if (!state.game) {
          throw new NoGameError();
        }
        state.game.pause();
        return {};
      });
      return;
    }
    if (UnpauseGameMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => {
        if (!state.game) {
          throw new NoGameError();
        }
        state.game.pause();
        return {};
      });
      return;
    }
    if (StepGameClockMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => {
        if (!state.game) {
          throw new NoGameError();
        }
        const { seconds } = message.params;
        state.game.skip(seconds);
        return {};
      });
      return;
    }
    if (StepGameMessage.type.isRequest(message)) {
      const { traversal } = message.params;
      connection.sendResponse(message, () => {
        if (!state.game) {
          throw new NoGameError();
        }
        return { done: state.game.step(traversal) };
      });
      return;
    }
    if (ContinueGameMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => {
        if (!state.game) {
          throw new NoGameError();
        }
        return { done: state.game.continue() };
      });
      return;
    }
    if (EnableGameDebugMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => {
        pending.debugging = true;
        state.game?.startDebugging();
        return {};
      });
      return;
    }
    if (DisableGameDebugMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => {
        pending.debugging = false;
        state.game?.stopDebugging();
        return {};
      });
      return;
    }
    if (SetGameBreakpointsMessage.type.isRequest(message)) {
      const { breakpoints } = message.params;
      connection.sendResponse(message, () => {
        pending.breakpoints = breakpoints;
        return {
          breakpoints: state.game ? state.game.setBreakpoints(breakpoints) : [],
        };
      });
      return;
    }
    if (SetGameDataBreakpointsMessage.type.isRequest(message)) {
      const { dataBreakpoints } = message.params;
      connection.sendResponse(message, () => {
        pending.dataBreakpoints = dataBreakpoints;
        return {
          dataBreakpoints: state.game
            ? state.game.setDataBreakpoints(dataBreakpoints)
            : [],
        };
      });
      return;
    }
    if (SetGameFunctionBreakpointsMessage.type.isRequest(message)) {
      const { functionBreakpoints } = message.params;
      connection.sendResponse(message, () => {
        pending.functionBreakpoints = functionBreakpoints;
        return {
          functionBreakpoints: state.game
            ? state.game.setFunctionBreakpoints(functionBreakpoints)
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
        if (!state.game) {
          throw new NoGameError();
        }
        return { context: state.game.getEvaluationContext() };
      });
      return;
    }
    if (GetGamePossibleBreakpointLocationsMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => {
        if (!state.game) {
          throw new NoGameError();
        }
        const { search } = message.params;
        const program = state.game.program;
        const lines = possibleBreakpointLines(
          program.pathLocations,
          Object.keys(program.scripts),
          search,
        );
        return { lines };
      });
      return;
    }
    if (GetGameScriptsMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => {
        if (!state.game) {
          throw new NoGameError();
        }
        const program = state.game.program;
        const uris = Object.keys(program?.scripts || {});
        return { uris };
      });
      return;
    }
    if (GetGameStackTraceMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => {
        if (!state.game) {
          throw new NoGameError();
        }
        const { threadId, startFrame, levels } = message.params;
        return state.game.getStackTrace(threadId, startFrame, levels);
      });
      return;
    }
    if (GetGameThreadsMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => {
        if (!state.game) {
          throw new NoGameError();
        }
        const threads = state.game.getThreads();
        return { threads };
      });
      return;
    }
    if (GetGameVariablesMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => {
        if (!state.game) {
          throw new NoGameError();
        }
        const { scope, variablesReference, value } = message.params;
        if (scope === "temps") {
          const variables = state.game.getTempVariables();
          return { variables };
        }
        if (scope === "vars") {
          const variables = state.game.getVarVariables();
          return { variables };
        }
        if (scope === "lists") {
          const variables = state.game.getListVariables();
          return { variables };
        }
        if (scope === "defines") {
          const variables = state.game.getDefineVariables();
          return { variables };
        }
        if (scope === "children") {
          const variables = state.game.getChildVariables(
            variablesReference ?? 0,
          );
          return { variables };
        }
        if (scope === "value") {
          const variables = state.game.getValueVariables(value);
          return { variables };
        }
        return { variables: [] };
      });
      return;
    }
  });

  return state;
}
