import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/classes/MessageProtocolNotificationType";
import { IMessage } from "@impower/jsonrpc/src/types/IMessage";
import { Message } from "@impower/jsonrpc/src/types/Message";
import { RequestMessage } from "@impower/jsonrpc/src/types/RequestMessage";
import { ResponseError } from "@impower/jsonrpc/src/types/ResponseError";
import { ResponseMessage } from "@impower/jsonrpc/src/types/ResponseMessage";
import { isNotification } from "@impower/jsonrpc/src/utils/isNotification";
import { isRequest } from "@impower/jsonrpc/src/utils/isRequest";
import { isResponse } from "@impower/jsonrpc/src/utils/isResponse";
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
import { SetGameSimulateChoicesMessage } from "../game/core/classes/messages/SetGameSimulateChoicesMessage";
import { SetGameStartFromMessage } from "../game/core/classes/messages/SetGameStartFromMessage";
import { StartGameMessage } from "../game/core/classes/messages/StartGameMessage";
import { StepGameClockMessage } from "../game/core/classes/messages/StepGameClockMessage";
import { StepGameMessage } from "../game/core/classes/messages/StepGameMessage";
import { UnpauseGameMessage } from "../game/core/classes/messages/UnpauseGameMessage";
import { SystemConfiguration } from "../game/core/types/SystemConfiguration";

console.log("running spark-engine");

let _game: Game | undefined = undefined;

const systemConfiguration: SystemConfiguration = {
  now: performance.now,
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

class NoGameError extends Error {
  override message = "no game loaded";
  code = -32900;
}

const profile = (mark: "start" | "end", method: string, uri: string = "") => {
  if (mark === "end") {
    performance.mark(`${method} ${uri} end`);
    performance.measure(
      `${method} ${uri}`.trim(),
      `${method} ${uri} start`,
      `${method} ${uri} end`
    );
  } else {
    performance.mark(`${method} ${uri} start`);
  }
};

const respond = <MessageMethod extends string, MessageParams, MessageResult>(
  message: RequestMessage<MessageMethod, MessageParams, MessageResult>,
  work?: () => MessageResult,
  transfer?: (result: MessageResult) => ArrayBuffer | undefined
): void => {
  const method = message.method;
  const id = message.id;
  const uri = _game?.program?.uri || "";
  profile("start", method, uri);
  let result: MessageResult | undefined = undefined;
  let error: ResponseError | undefined = undefined;
  try {
    result = work?.();
  } catch (e) {
    if (typeof e === "object" && e) {
      if ("message" in e) {
        error = e as ResponseError;
      }
    }
  }
  profile("start", "respond " + method, uri);
  const transferable = result != null ? transfer?.(result) : undefined;
  const options = transferable ? [transferable] : {};
  const response: ResponseMessage<MessageMethod, MessageResult> = {
    jsonrpc: "2.0",
    method,
    id,
  };
  if (result !== undefined) {
    response.result = result;
  }
  if (error !== undefined) {
    response.error = error;
  }
  postMessage(response, options);
  profile("end", "respond " + method, uri);
  profile("end", method, uri);
};

const notify = <MessageMethod extends string, MessageParams>(
  messageType: MessageProtocolNotificationType<MessageMethod, MessageParams>,
  params: MessageParams
): void => {
  const notification = messageType.notification(params);
  postMessage(notification);
};

const forward = (message: IMessage, transfer?: ArrayBuffer[]): void => {
  postMessage(message, transfer ?? []);
};

onmessage = async (e) => {
  const message = e.data;
  if (isResponse(message) || isNotification(message)) {
    if (_game) {
      _game.connection.receive(message);
    }
  }
  if (InitializeMessage.type.isRequest(message)) {
    respond(message, () => ({}));
    notify(InitializedMessage.type, {});
  }
  if (DestroyGameMessage.type.isRequest(message)) {
    respond(message, () => {
      if (_game) {
        _game.destroy();
        _game = undefined;
      }
      return {};
    });
  }
  if (CreateGameMessage.type.isRequest(message)) {
    const { program, ...options } = message.params;
    respond(message, () => {
      if (_game) {
        _game.destroy();
      }
      _game = new Game(program, {
        ...systemConfiguration,
        ...options,
      });
      return {
        simulatePath: _game.simulatePath,
        simulateChoices: _game.simulateChoices,
        startPath: _game.startPath,
      };
    });
  }
  if (ConnectGameMessage.type.isRequest(message)) {
    respond(message, async () => {
      if (!_game) {
        throw new NoGameError();
      }
      await _game.connect((msg: Message, transfer?: ArrayBuffer[]) => {
        if (isRequest(msg) || isNotification(msg)) {
          forward(msg, transfer);
        }
      });
      return {};
    });
  }
  if (PreviewGameMessage.type.isRequest(message)) {
    const { previewFrom } = message.params;
    respond(message, () => {
      if (!_game) {
        throw new NoGameError();
      }
      return { previewPath: _game.preview(previewFrom.file, previewFrom.line) };
    });
  }
  if (StartGameMessage.type.isRequest(message)) {
    respond(message, () => {
      if (!_game) {
        throw new NoGameError();
      }
      return { success: _game.start() };
    });
  }
  if (PauseGameMessage.type.isRequest(message)) {
    respond(message, () => {
      if (!_game) {
        throw new NoGameError();
      }
      _game.pause();
      return {};
    });
  }
  if (UnpauseGameMessage.type.isRequest(message)) {
    respond(message, () => {
      if (!_game) {
        throw new NoGameError();
      }
      _game.pause();
      return {};
    });
  }
  if (StepGameClockMessage.type.isRequest(message)) {
    respond(message, () => {
      if (!_game) {
        throw new NoGameError();
      }
      const { seconds } = message.params;
      _game.skip(seconds);
      return {};
    });
  }
  if (StepGameMessage.type.isRequest(message)) {
    const { traversal } = message.params;
    respond(message, () => {
      if (!_game) {
        throw new NoGameError();
      }
      return { done: _game.step(traversal) };
    });
  }
  if (ContinueGameMessage.type.isRequest(message)) {
    respond(message, () => {
      if (!_game) {
        throw new NoGameError();
      }
      return { done: _game.continue() };
    });
  }
  if (EnableGameDebugMessage.type.isRequest(message)) {
    respond(message, () => {
      if (!_game) {
        throw new NoGameError();
      }
      _game.startDebugging();
      return {};
    });
  }
  if (DisableGameDebugMessage.type.isRequest(message)) {
    respond(message, () => {
      if (!_game) {
        throw new NoGameError();
      }
      _game.stopDebugging();
      return {};
    });
  }
  if (SetGameBreakpointsMessage.type.isRequest(message)) {
    const { breakpoints } = message.params;
    respond(message, () => {
      if (!_game) {
        throw new NoGameError();
      }
      return { breakpoints: _game.setBreakpoints(breakpoints) };
    });
  }
  if (SetGameDataBreakpointsMessage.type.isRequest(message)) {
    const { dataBreakpoints } = message.params;
    respond(message, () => {
      if (!_game) {
        throw new NoGameError();
      }
      return { dataBreakpoints: _game.setDataBreakpoints(dataBreakpoints) };
    });
  }
  if (SetGameFunctionBreakpointsMessage.type.isRequest(message)) {
    const { functionBreakpoints } = message.params;
    respond(message, () => {
      if (!_game) {
        throw new NoGameError();
      }
      return {
        functionBreakpoints: _game.setFunctionBreakpoints(functionBreakpoints),
      };
    });
  }
  if (SetGameSimulateChoicesMessage.type.isRequest(message)) {
    const { simulateChoices } = message.params;
    respond(message, () => {
      if (!_game) {
        throw new NoGameError();
      }
      return {
        simulateChoices: _game.setSimulateChoices(simulateChoices),
      };
    });
  }
  if (SetGameStartFromMessage.type.isRequest(message)) {
    const { startFrom } = message.params;
    respond(message, () => {
      if (!_game) {
        throw new NoGameError();
      }
      return {
        startFrom: _game.setStartFrom(startFrom),
      };
    });
  }
  if (GetGameEvaluationContextMessage.type.isRequest(message)) {
    respond(message, () => {
      if (!_game) {
        throw new NoGameError();
      }
      return { context: _game.getEvaluationContext() };
    });
  }
  if (GetGamePossibleBreakpointLocationsMessage.type.isRequest(message)) {
    respond(message, () => {
      if (!_game) {
        throw new NoGameError();
      }
      const { search } = message.params;
      const program = _game.program;
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
  }
  if (GetGameScriptsMessage.type.isRequest(message)) {
    respond(message, () => {
      if (!_game) {
        throw new NoGameError();
      }
      const program = _game.program;
      const uris = Object.keys(program?.scripts || {});
      return { uris };
    });
  }
  if (GetGameStackTraceMessage.type.isRequest(message)) {
    respond(message, () => {
      if (!_game) {
        throw new NoGameError();
      }
      const { threadId, startFrame, levels } = message.params;
      return _game.getStackTrace(threadId, startFrame, levels);
    });
  }
  if (GetGameThreadsMessage.type.isRequest(message)) {
    respond(message, () => {
      if (!_game) {
        throw new NoGameError();
      }
      const threads = _game.getThreads();
      return { threads };
    });
  }
  if (GetGameVariablesMessage.type.isRequest(message)) {
    respond(message, () => {
      if (!_game) {
        throw new NoGameError();
      }
      const { scope, variablesReference, value } = message.params;
      if (scope === "temps") {
        const variables = _game.getTempVariables();
        return { variables };
      }
      if (scope === "vars") {
        const variables = _game.getVarVariables();
        return { variables };
      }
      if (scope === "lists") {
        const variables = _game.getListVariables();
        return { variables };
      }
      if (scope === "defines") {
        const variables = _game.getDefineVariables();
        return { variables };
      }
      if (scope === "children") {
        const variables = _game.getChildVariables(variablesReference ?? 0);
        return { variables };
      }
      if (scope === "value") {
        const variables = _game.getValueVariables(value);
        return { variables };
      }
      return { variables: [] };
    });
  }
};

export default "";
