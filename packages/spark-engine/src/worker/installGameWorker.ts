import { MessageConnection } from "@impower/jsonrpc/src/browser/classes/MessageConnection";
import { Message } from "@impower/jsonrpc/src/common/types/Message";
import { ResponseError } from "@impower/jsonrpc/src/common/types/ResponseError";
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
import { SystemConfiguration } from "../game/core/types/SystemConfiguration";

export class NoGameError extends Error implements ResponseError {
  override message = "no game loaded";
  code = -32900;
}

export function installGameWorker(connection: MessageConnection) {
  console.log("running spark-engine");

  const systemConfiguration: SystemConfiguration = {
    now: () => performance.now(),
    setTimeout: self.setTimeout,
    requestFrame: self.requestAnimationFrame,
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

  const state: { systemConfiguration: SystemConfiguration; game?: Game } = {
    systemConfiguration,
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
        state.game = new Game({ program, ...systemConfiguration, ...options });
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
      connection.sendResponse(message, () => {
        if (!state.game) {
          throw new NoGameError();
        }
        return {
          previewPath: state.game.preview(previewFrom.file, previewFrom.line),
        };
      });
      return;
    }
    if (StartGameMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => {
        if (!state.game) {
          throw new NoGameError();
        }
        return { success: state.game.start() };
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
        if (!state.game) {
          throw new NoGameError();
        }
        state.game.startDebugging();
        return {};
      });
      return;
    }
    if (DisableGameDebugMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => {
        if (!state.game) {
          throw new NoGameError();
        }
        state.game.stopDebugging();
        return {};
      });
      return;
    }
    if (SetGameBreakpointsMessage.type.isRequest(message)) {
      const { breakpoints } = message.params;
      connection.sendResponse(message, () => {
        if (!state.game) {
          throw new NoGameError();
        }
        return { breakpoints: state.game.setBreakpoints(breakpoints) };
      });
      return;
    }
    if (SetGameDataBreakpointsMessage.type.isRequest(message)) {
      const { dataBreakpoints } = message.params;
      connection.sendResponse(message, () => {
        if (!state.game) {
          throw new NoGameError();
        }
        return {
          dataBreakpoints: state.game.setDataBreakpoints(dataBreakpoints),
        };
      });
      return;
    }
    if (SetGameFunctionBreakpointsMessage.type.isRequest(message)) {
      const { functionBreakpoints } = message.params;
      connection.sendResponse(message, () => {
        if (!state.game) {
          throw new NoGameError();
        }
        return {
          functionBreakpoints:
            state.game.setFunctionBreakpoints(functionBreakpoints),
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
        const lines: number[] = [];
        const possibleLocations = Object.values(program.pathLocations || {});
        const scripts = Object.keys(program.scripts);
        const searchScriptIndex = scripts.indexOf(search.uri);
        for (const possibleLocation of possibleLocations) {
          const [scriptIndex, line] = possibleLocation;
          if (scriptIndex != null && scriptIndex === searchScriptIndex) {
            if (
              line >= search.range.start.line &&
              line <= search.range.end.line
            ) {
              lines.push(line);
            }
          }
          if (scriptIndex > searchScriptIndex) {
            break;
          }
        }
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
            variablesReference ?? 0
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
