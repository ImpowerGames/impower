import {
  ConfigureGameMessage,
  ConfigureGameMethod,
  ConfigureGameParams,
} from "@impower/spark-editor-protocol/src/protocols/game/ConfigureGameMessage";
import {
  ContinueGameMessage,
  ContinueGameMethod,
  ContinueGameParams,
} from "@impower/spark-editor-protocol/src/protocols/game/ContinueGameMessage";
import {
  DisableGameDebugMessage,
  DisableGameDebugMethod,
} from "@impower/spark-editor-protocol/src/protocols/game/DisableGameDebugMessage";
import {
  EnableGameDebugMessage,
  EnableGameDebugMethod,
} from "@impower/spark-editor-protocol/src/protocols/game/EnableGameDebugMessage";
import { GameAutoAdvancedToContinueMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameAutoAdvancedToContinueMessage";
import { GameAwaitingInteractionMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameAwaitingInteractionMessage";
import { GameChosePathToContinueMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameChosePathToContinueMessage";
import { GameClickedToContinueMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameClickedToContinueMessage";
import { GameExecutedMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameExecutedMessage";
import { GameExitedMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameExitedMessage";
import { GameExitedThreadMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameExitedThreadMessage";
import { GameHitBreakpointMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameHitBreakpointMessage";
import { GameStartedThreadMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameStartedThreadMessage";
import { GameSteppedMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameSteppedMessage";
import {
  GetGamePossibleBreakpointLocationsMessage,
  GetGamePossibleBreakpointLocationsMethod,
  GetGamePossibleBreakpointLocationsParams,
} from "@impower/spark-editor-protocol/src/protocols/game/GetGamePossibleBreakpointLocationsMessage";
import {
  GetGameScriptsMessage,
  GetGameScriptsMethod,
  GetGameScriptsParams,
} from "@impower/spark-editor-protocol/src/protocols/game/GetGameScriptsMessage";
import {
  GetGameStackTraceMessage,
  GetGameStackTraceMethod,
  GetGameStackTraceParams,
} from "@impower/spark-editor-protocol/src/protocols/game/GetGameStackTraceMessage";
import {
  GetGameThreadsMessage,
  GetGameThreadsMethod,
  GetGameThreadsParams,
} from "@impower/spark-editor-protocol/src/protocols/game/GetGameThreadsMessage";
import {
  LoadGameMessage,
  LoadGameMethod,
  LoadGameParams,
} from "@impower/spark-editor-protocol/src/protocols/game/LoadGameMessage";
import {
  PauseGameMessage,
  PauseGameMethod,
} from "@impower/spark-editor-protocol/src/protocols/game/PauseGameMessage";
import {
  StartGameMessage,
  StartGameMethod,
  StartGameParams,
} from "@impower/spark-editor-protocol/src/protocols/game/StartGameMessage";
import {
  StepGameClockMessage,
  StepGameClockMethod,
  StepGameClockParams,
} from "@impower/spark-editor-protocol/src/protocols/game/StepGameClockMessage";
import {
  StepGameMessage,
  StepGameMethod,
  StepGameParams,
} from "@impower/spark-editor-protocol/src/protocols/game/StepGameMessage";
import {
  StopGameMessage,
  StopGameMethod,
  StopGameParams,
} from "@impower/spark-editor-protocol/src/protocols/game/StopGameMessage";
import {
  UnpauseGameMessage,
  UnpauseGameMethod,
} from "@impower/spark-editor-protocol/src/protocols/game/UnpauseGameMessage";
import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { ConnectedPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/ConnectedPreviewMessage";
import {
  LoadPreviewMessage,
  LoadPreviewMethod,
} from "@impower/spark-editor-protocol/src/protocols/preview/LoadPreviewMessage";
import { RequestMessage } from "@impower/spark-editor-protocol/src/types/base/RequestMessage";
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { AutoAdvancedToContinueMessage } from "@impower/spark-engine/src/game/core/classes/messages/AutoAdvancedToContinueMessage";
import { AwaitingInteractionMessage } from "@impower/spark-engine/src/game/core/classes/messages/AwaitingInteractionMessage";
import { ChosePathToContinueMessage } from "@impower/spark-engine/src/game/core/classes/messages/ChoosePathToContinueMessage";
import { ClickedToContinueMessage } from "@impower/spark-engine/src/game/core/classes/messages/ClickedToContinueMessage";
import { ExecutedMessage } from "@impower/spark-engine/src/game/core/classes/messages/ExecutedMessage";
import { ExitedThreadMessage } from "@impower/spark-engine/src/game/core/classes/messages/ExitedThreadMessage";
import { FinishedMessage } from "@impower/spark-engine/src/game/core/classes/messages/FinishedMessage";
import { HitBreakpointMessage } from "@impower/spark-engine/src/game/core/classes/messages/HitBreakpointMessage";
import { RuntimeErrorMessage } from "@impower/spark-engine/src/game/core/classes/messages/RuntimeErrorMessage";
import { StartedThreadMessage } from "@impower/spark-engine/src/game/core/classes/messages/StartedThreadMessage";
import { SteppedMessage } from "@impower/spark-engine/src/game/core/classes/messages/SteppedMessage";
import { DocumentLocation } from "@impower/spark-engine/src/game/core/types/DocumentLocation";
import { ErrorType } from "@impower/spark-engine/src/game/core/types/ErrorType";
import { SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import { Component } from "../../../spec-component/src/component";
import Application from "../app/Application";
import { debounce } from "../utils/debounce";
import spec from "./_spark-web-player";

export default class SparkWebPlayer extends Component(spec) {
  _game?: Game;

  _app?: Application;

  _debugging = false;

  _program?: SparkProgram;

  _options?: {
    breakpoints?: { file: string; line: number }[];
    functionBreakpoints?: { name: string }[];
    startpoint?: { file: string; line: number };
  };

  _loadListeners = new Set<() => void>();

  override onConnected() {
    window.addEventListener(MessageProtocol.event, this.handleProtocol);
    this.emit(
      MessageProtocol.event,
      ConnectedPreviewMessage.type.notification({ type: "game" })
    );
  }

  override onDisconnected() {
    window.removeEventListener(MessageProtocol.event, this.handleProtocol);
  }

  protected handleProtocol = async (e: Event) => {
    if (e instanceof CustomEvent) {
      if (ConfigureGameMessage.type.is(e.detail)) {
        const response = await this.handleConfigureGame(e.detail);
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (LoadGameMessage.type.is(e.detail)) {
        const response = await this.handleLoadGame(e.detail);
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (StartGameMessage.type.is(e.detail)) {
        const response = await this.handleStartGame(e.detail);
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (StopGameMessage.type.is(e.detail)) {
        const response = await this.handleStopGame(e.detail);
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (PauseGameMessage.type.is(e.detail)) {
        const response = await this.handlePauseGame(e.detail);
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (UnpauseGameMessage.type.is(e.detail)) {
        const response = await this.handleUnpauseGame(e.detail);
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (StepGameClockMessage.type.is(e.detail)) {
        const response = await this.handleStepGameClock(e.detail);
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (StepGameMessage.type.is(e.detail)) {
        const response = await this.handleStepGame(e.detail);
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (ContinueGameMessage.type.is(e.detail)) {
        const response = await this.handleContinueGame(e.detail);
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (GetGameScriptsMessage.type.is(e.detail)) {
        const response = await this.handleGetGameScripts(e.detail);
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (GetGamePossibleBreakpointLocationsMessage.type.is(e.detail)) {
        const response = await this.handleGetGamePossibleBreakpointLocations(
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (GetGameStackTraceMessage.type.is(e.detail)) {
        const response = await this.handleGetGameStackTrace(e.detail);
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (GetGameThreadsMessage.type.is(e.detail)) {
        const response = await this.handleGetGameThreads(e.detail);
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (EnableGameDebugMessage.type.is(e.detail)) {
        const response = await this.handleEnableGameDebug(e.detail);
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (DisableGameDebugMessage.type.is(e.detail)) {
        const response = await this.handleDisableGameDebug(e.detail);
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (LoadPreviewMessage.type.is(e.detail)) {
        const response = await this.handleLoadPreview(e.detail);
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
    }
  };

  protected handleConfigureGame = async (
    message: RequestMessage<ConfigureGameMethod, ConfigureGameParams>
  ) => {
    const { startpoint, breakpoints, functionBreakpoints } = message.params;
    if (!this._program) {
      // wait for program to be loaded
      await new Promise<void>((resolve) => {
        this._loadListeners.add(resolve);
      });
    }
    if (startpoint) {
      this._options ??= {};
      this._options.startpoint = startpoint;
      this._game?.setStartpoint(startpoint);
    }
    if (breakpoints) {
      this._options ??= {};
      this._options.breakpoints = breakpoints;
      this._game?.setBreakpoints(breakpoints);
    }
    if (functionBreakpoints) {
      this._options ??= {};
      this._options.functionBreakpoints = functionBreakpoints;
      this._game?.setFunctionBreakpoints(functionBreakpoints);
    }
    const actualBreakpoints =
      breakpoints && this._program?.pathToLocation
        ? Game.getActualBreakpoints(
            Object.values(this._program.pathToLocation),
            breakpoints,
            Object.keys(this._program.scripts)
          )
        : undefined;
    const actualFunctionBreakpoints =
      functionBreakpoints && this._program?.functionLocations
        ? Game.getActualFunctionBreakpoints(
            this._program.functionLocations,
            functionBreakpoints,
            Object.keys(this._program.scripts)
          )
        : undefined;
    return ConfigureGameMessage.type.response(message.id, {
      breakpoints: actualBreakpoints,
      functionBreakpoints: actualFunctionBreakpoints,
    });
  };

  protected handleLoadGame = async (
    message: RequestMessage<LoadGameMethod, LoadGameParams>
  ) => {
    const params = message.params;
    this._program = params.program;
    this._loadListeners.forEach((callback) => {
      callback();
    });
    this._loadListeners.clear();
    if (this._game?.state === "running") {
      // Stop and restart game if we loaded a new game while the old game was running
      this.debouncedBuildGame();
    }
    return LoadGameMessage.type.response(message.id, null);
  };

  protected handleStartGame = async (
    message: RequestMessage<StartGameMethod, StartGameParams>
  ) => {
    if (!this._program) {
      // wait for program to be loaded
      await new Promise<void>((resolve) => {
        this._loadListeners.add(resolve);
      });
    }
    const success = this.buildGame();
    return StartGameMessage.type.response(message.id, success);
  };

  protected handleStopGame = async (
    message: RequestMessage<StopGameMethod, StopGameParams>
  ) => {
    this.stopGame("quit");
    return StopGameMessage.type.response(message.id, null);
  };

  protected handlePauseGame = async (
    message: RequestMessage<PauseGameMethod>
  ) => {
    if (this._app) {
      this._app.pause();
      return PauseGameMessage.type.response(message.id, null);
    }
    return PauseGameMessage.type.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  };

  protected handleUnpauseGame = async (
    message: RequestMessage<UnpauseGameMethod>
  ) => {
    if (this._app) {
      this._app.unpause();
      return UnpauseGameMessage.type.response(message.id, null);
    }
    return UnpauseGameMessage.type.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  };

  protected handleStepGameClock = async (
    message: RequestMessage<StepGameClockMethod, StepGameClockParams>
  ) => {
    const { deltaMS } = message.params;
    if (this._app) {
      this._app.step(deltaMS);
      return StepGameClockMessage.type.response(message.id, null);
    }
    return StepGameClockMessage.type.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  };

  protected handleStepGame = async (
    message: RequestMessage<StepGameMethod, StepGameParams>
  ) => {
    const { traversal } = message.params;
    if (this._game) {
      this._game.step(traversal);
      return StepGameMessage.type.response(message.id, null);
    }
    return StepGameMessage.type.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  };

  protected handleContinueGame = async (
    message: RequestMessage<ContinueGameMethod, ContinueGameParams>
  ) => {
    if (this._game) {
      this._game.continue();
      return ContinueGameMessage.type.response(message.id, null);
    }
    return ContinueGameMessage.type.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  };

  protected handleGetGameScripts = async (
    message: RequestMessage<GetGameScriptsMethod, GetGameScriptsParams>
  ) => {
    if (this._program) {
      const uris = Object.keys(this._program?.scripts || {});
      return GetGameScriptsMessage.type.response(message.id, { uris });
    }
    return GetGameScriptsMessage.type.error(message.id, {
      code: 1,
      message: "no program loaded",
    });
  };

  protected handleGetGameThreads = async (
    message: RequestMessage<GetGameThreadsMethod, GetGameThreadsParams>
  ) => {
    if (this._game) {
      const threads = this._game.getThreads();
      return GetGameThreadsMessage.type.response(message.id, { threads });
    }
    return GetGameThreadsMessage.type.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  };

  protected handleGetGamePossibleBreakpointLocations = async (
    message: RequestMessage<
      GetGamePossibleBreakpointLocationsMethod,
      GetGamePossibleBreakpointLocationsParams
    >
  ) => {
    const { search } = message.params;
    const program = this._game?.program || this._program;
    if (program) {
      const lines: number[] = [];
      const possibleLocations = Object.values(program.pathToLocation);
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
      const result = { lines };
      return GetGamePossibleBreakpointLocationsMessage.type.response(
        message.id,
        result
      );
    }
    return GetGamePossibleBreakpointLocationsMessage.type.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  };

  protected handleGetGameStackTrace = async (
    message: RequestMessage<GetGameStackTraceMethod, GetGameStackTraceParams>
  ) => {
    const { threadId, startFrame, levels } = message.params;
    if (this._game) {
      const result = this._game.getStackTrace(threadId, startFrame, levels);
      return GetGameStackTraceMessage.type.response(message.id, result);
    }
    return GetGameStackTraceMessage.type.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  };

  protected handleEnableGameDebug = async (
    message: RequestMessage<EnableGameDebugMethod>
  ) => {
    if (this._game) {
      this._game.startDebugging();
      return EnableGameDebugMessage.type.response(message.id, null);
    }
    return EnableGameDebugMessage.type.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  };

  protected handleDisableGameDebug = async (
    message: RequestMessage<DisableGameDebugMethod>
  ) => {
    if (this._game) {
      this._game.stopDebugging();
      return DisableGameDebugMessage.type.response(message.id, null);
    }
    return DisableGameDebugMessage.type.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  };

  protected handleLoadPreview = async (
    message: RequestMessage<LoadPreviewMethod>
  ) => {
    const { type, textDocument, selectedRange } = message.params;
    if (type === "game") {
      const line = selectedRange?.start.line ?? 0;
      this.updatePreview(textDocument.uri, line);
      return LoadPreviewMessage.type.response(message.id, null);
    }
    return undefined;
  };

  stopGame(
    reason: "finished" | "quit" | "invalidated" | "error",
    error?: {
      message: string;
      location: DocumentLocation;
    }
  ) {
    this.emit(
      MessageProtocol.event,
      GameExitedMessage.type.notification({
        reason,
        error,
      })
    );
    if (this._app) {
      this._app.destroy(true);
      this._app = undefined;
    }
    if (this._game) {
      this._game.destroy();
      this._game = undefined;
    }
  }

  protected debouncedBuildGame = debounce(
    (preview?: { file: string; line: number }) => this.buildGame(preview),
    1000
  );

  buildGame(preview?: { file: string; line: number }): boolean {
    const options = this._options;
    const startpoint = options?.startpoint;
    const breakpoints = options?.breakpoints;
    const functionBreakpoints = options?.functionBreakpoints;
    if (!this._program || !this._program.compiled) {
      return false;
    }
    if (this._game) {
      this._game.destroy();
    }
    this._game = new Game(this._program, {
      startpoint,
      breakpoints,
      functionBreakpoints,
      preview,
    });
    this._game.connection.outgoing.addListener(
      RuntimeErrorMessage.method,
      (msg) => {
        if (RuntimeErrorMessage.type.isNotification(msg)) {
          const type = msg.params.type;
          const message = msg.params.message;
          const location = msg.params.location;
          // TODO: Display message in on-screen debug console
          if (type === ErrorType.Error) {
            console.error(message, location);
          } else if (type === ErrorType.Warning) {
            console.warn(message, location);
          } else {
            console.log(message, location);
          }
          const error = {
            message,
            location,
          };
          this.stopGame("error", error);
        }
      }
    );
    this._game.connection.outgoing.addListener(
      FinishedMessage.method,
      (msg) => {
        if (FinishedMessage.type.isNotification(msg)) {
          this.stopGame("finished");
        }
      }
    );
    this._game.connection.outgoing.addListener(
      StartedThreadMessage.method,
      (msg) => {
        if (StartedThreadMessage.type.isNotification(msg)) {
          const { threadId } = msg.params;
          this.emit(
            MessageProtocol.event,
            GameStartedThreadMessage.type.notification({
              threadId,
            })
          );
        }
      }
    );
    this._game.connection.outgoing.addListener(
      ExitedThreadMessage.method,
      (msg) => {
        if (ExitedThreadMessage.type.isNotification(msg)) {
          const { threadId } = msg.params;
          this.emit(
            MessageProtocol.event,
            GameExitedThreadMessage.type.notification({
              threadId,
            })
          );
        }
      }
    );
    this._game.connection.outgoing.addListener(
      ExecutedMessage.method,
      (msg) => {
        if (ExecutedMessage.type.isNotification(msg)) {
          const { location, frameId } = msg.params;
          this.emit(
            MessageProtocol.event,
            GameExecutedMessage.type.notification({
              location,
              frameId,
            })
          );
        }
      }
    );
    this._game.connection.outgoing.addListener(SteppedMessage.method, (msg) => {
      if (SteppedMessage.type.isNotification(msg)) {
        const { location } = msg.params;
        this.emit(
          MessageProtocol.event,
          GameSteppedMessage.type.notification({ location })
        );
      }
    });
    this._game.connection.outgoing.addListener(
      HitBreakpointMessage.method,
      (msg) => {
        if (HitBreakpointMessage.type.isNotification(msg)) {
          const { location } = msg.params;
          this.emit(
            MessageProtocol.event,
            GameHitBreakpointMessage.type.notification({
              location,
            })
          );
        }
      }
    );
    this._game.connection.outgoing.addListener(
      AwaitingInteractionMessage.method,
      (msg) => {
        if (AwaitingInteractionMessage.type.isNotification(msg)) {
          const { location } = msg.params;
          this.emit(
            MessageProtocol.event,
            GameAwaitingInteractionMessage.type.notification({
              location,
            })
          );
        }
      }
    );
    this._game.connection.outgoing.addListener(
      AutoAdvancedToContinueMessage.method,
      (msg) => {
        if (AutoAdvancedToContinueMessage.type.isNotification(msg)) {
          const { location } = msg.params;
          this.emit(
            MessageProtocol.event,
            GameAutoAdvancedToContinueMessage.type.notification({
              location,
            })
          );
        }
      }
    );
    this._game.connection.outgoing.addListener(
      ClickedToContinueMessage.method,
      (msg) => {
        if (ClickedToContinueMessage.type.isNotification(msg)) {
          const { location } = msg.params;
          this.emit(
            MessageProtocol.event,
            GameClickedToContinueMessage.type.notification({
              location,
            })
          );
        }
      }
    );
    this._game.connection.outgoing.addListener(
      ChosePathToContinueMessage.method,
      (msg) => {
        if (ChosePathToContinueMessage.type.isNotification(msg)) {
          const { location } = msg.params;
          this.emit(
            MessageProtocol.event,
            GameChosePathToContinueMessage.type.notification({
              location,
            })
          );
        }
      }
    );
    if (this._game) {
      if (this._app) {
        this._app.destroy(true);
        this._app = undefined;
      }
      this._app = new Application(
        this._game,
        this.ref.gameView,
        this.ref.gameOverlay
      );
    }
    return true;
  }

  updatePreview(file: string, line: number) {
    if (
      !this._game ||
      (this._game.state === "previewing" &&
        this._game.program.version !== this._program?.version)
    ) {
      // If haven't built game yet, or programs have changed since last build, build game.
      this.buildGame({ file, line });
    }
    if (this._game && this._game.state === "previewing") {
      this._game.preview(file, line);
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "spark-web-player": SparkWebPlayer;
  }
}
