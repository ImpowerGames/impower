import { ConfigureGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/ConfigureGameMessage";
import { ContinueGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/ContinueGameMessage";
import { DisableGameDebugMessage } from "@impower/spark-editor-protocol/src/protocols/game/DisableGameDebugMessage";
import { EnableGameDebugMessage } from "@impower/spark-editor-protocol/src/protocols/game/EnableGameDebugMessage";
import { GameAutoAdvancedToContinueMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameAutoAdvancedToContinueMessage";
import { GameAwaitingInteractionMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameAwaitingInteractionMessage";
import { GameChosePathToContinueMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameChosePathToContinueMessage";
import { GameClickedToContinueMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameClickedToContinueMessage";
import { GameExecutedMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameExecutedMessage";
import { GameExitedMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameExitedMessage";
import { GameExitedThreadMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameExitedThreadMessage";
import { GameHitBreakpointMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameHitBreakpointMessage";
import { GameStartedMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameStartedMessage";
import { GameStartedThreadMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameStartedThreadMessage";
import { GameSteppedMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameSteppedMessage";
import { GetGameEvaluationContextMessage } from "@impower/spark-editor-protocol/src/protocols/game/GetGameEvaluationContextMessage";
import { GetGamePossibleBreakpointLocationsMessage } from "@impower/spark-editor-protocol/src/protocols/game/GetGamePossibleBreakpointLocationsMessage";
import { GetGameScriptsMessage } from "@impower/spark-editor-protocol/src/protocols/game/GetGameScriptsMessage";
import { GetGameStackTraceMessage } from "@impower/spark-editor-protocol/src/protocols/game/GetGameStackTraceMessage";
import { GetGameThreadsMessage } from "@impower/spark-editor-protocol/src/protocols/game/GetGameThreadsMessage";
import { GetGameVariablesMessage } from "@impower/spark-editor-protocol/src/protocols/game/GetGameVariablesMessage";
import { LoadGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/LoadGameMessage";
import { PauseGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/PauseGameMessage";
import { StartGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/StartGameMessage";
import { StepGameClockMessage } from "@impower/spark-editor-protocol/src/protocols/game/StepGameClockMessage";
import { StepGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/StepGameMessage";
import { StopGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/StopGameMessage";
import { UnpauseGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/UnpauseGameMessage";
import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { ConnectedPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/ConnectedPreviewMessage";
import { LoadPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/LoadPreviewMessage";
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
import { StartedMessage } from "@impower/spark-engine/src/game/core/classes/messages/StartedMessage";
import { StartedThreadMessage } from "@impower/spark-engine/src/game/core/classes/messages/StartedThreadMessage";
import { SteppedMessage } from "@impower/spark-engine/src/game/core/classes/messages/SteppedMessage";
import { DocumentLocation } from "@impower/spark-engine/src/game/core/types/DocumentLocation";
import { ErrorType } from "@impower/spark-engine/src/game/core/types/ErrorType";
import { SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import { Component } from "../../../spec-component/src/component";
import { Application } from "../app/Application";
import { debounce } from "../utils/debounce";
import spec from "./_spark-web-player";

export default class SparkWebPlayer extends Component(spec) {
  _game?: Game;

  _app?: Application;

  _debugging = false;

  _program?: SparkProgram;

  _options?: {
    startpoint?: { file: string; line: number };
    breakpoints?: { file: string; line: number }[];
    functionBreakpoints?: { name: string }[];
    dataBreakpoints?: { dataId: string }[];
  };

  _loadListeners = new Set<() => void>();

  override onConnected() {
    this.ref.playButton?.addEventListener("click", this.handleClickPlayButton);
    window.addEventListener(MessageProtocol.event, this.handleProtocol);
    this.emit(
      MessageProtocol.event,
      ConnectedPreviewMessage.type.notification({ type: "game" })
    );
  }

  override onDisconnected() {
    this.ref.playButton?.removeEventListener(
      "click",
      this.handleClickPlayButton
    );
    window.removeEventListener(MessageProtocol.event, this.handleProtocol);
  }

  protected async hidePlayButton() {
    if (this.ref.playButton) {
      this.ref.playButton.style.pointerEvents = "none";
      this.ref.playButton.style.opacity = "0";
      const animations = this.ref.playButton.getAnimations();
      await Promise.allSettled(
        animations.map((animation) => animation.finished)
      );
      this.ref.playButton.style.display = "none";
    }
  }

  protected async showPlayButton() {
    if (this.ref.playButton) {
      this.ref.playButton.style.pointerEvents = "";
      this.ref.playButton.style.opacity = "";
      this.ref.playButton.style.display = "";
    }
  }

  protected handleClickPlayButton = async () => {
    const audioContext = new AudioContext();
    if (audioContext.state === "running") {
      await this.buildGame();
      const gameStarted = this._game?.start();
      if (gameStarted) {
        this._app?.start();
      }
    }
  };

  protected handleProtocol = async (e: Event) => {
    if (e instanceof CustomEvent) {
      if (ConfigureGameMessage.type.is(e.detail)) {
        const response = await this.handleConfigureGame(
          ConfigureGameMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (LoadGameMessage.type.is(e.detail)) {
        const response = await this.handleLoadGame(
          LoadGameMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (StartGameMessage.type.is(e.detail)) {
        const response = await this.handleStartGame(
          StartGameMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (StopGameMessage.type.is(e.detail)) {
        const response = await this.handleStopGame(
          StopGameMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (PauseGameMessage.type.is(e.detail)) {
        const response = await this.handlePauseGame(
          PauseGameMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (UnpauseGameMessage.type.is(e.detail)) {
        const response = await this.handleUnpauseGame(
          UnpauseGameMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (StepGameClockMessage.type.is(e.detail)) {
        const response = await this.handleStepGameClock(
          StepGameClockMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (StepGameMessage.type.is(e.detail)) {
        const response = await this.handleStepGame(
          StepGameMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (ContinueGameMessage.type.is(e.detail)) {
        const response = await this.handleContinueGame(
          ContinueGameMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (GetGameScriptsMessage.type.is(e.detail)) {
        const response = await this.handleGetGameScripts(
          GetGameScriptsMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (GetGamePossibleBreakpointLocationsMessage.type.is(e.detail)) {
        const response = await this.handleGetGamePossibleBreakpointLocations(
          GetGamePossibleBreakpointLocationsMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (GetGameStackTraceMessage.type.is(e.detail)) {
        const response = await this.handleGetGameStackTrace(
          GetGameStackTraceMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (GetGameEvaluationContextMessage.type.is(e.detail)) {
        const response = await this.handleGetGameEvaluationContext(
          GetGameEvaluationContextMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (GetGameVariablesMessage.type.is(e.detail)) {
        const response = await this.handleGetGameVariables(
          GetGameVariablesMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (GetGameThreadsMessage.type.is(e.detail)) {
        const response = await this.handleGetGameThreads(
          GetGameThreadsMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (EnableGameDebugMessage.type.is(e.detail)) {
        const response = await this.handleEnableGameDebug(
          EnableGameDebugMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (DisableGameDebugMessage.type.is(e.detail)) {
        const response = await this.handleDisableGameDebug(
          DisableGameDebugMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (LoadPreviewMessage.type.is(e.detail)) {
        const response = await this.handleLoadPreview(
          LoadPreviewMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
    }
  };

  protected handleConfigureGame = async (
    messageType: typeof ConfigureGameMessage.type,
    message: ConfigureGameMessage.Request
  ) => {
    const { startpoint, breakpoints, functionBreakpoints, dataBreakpoints } =
      message.params;
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
    if (dataBreakpoints) {
      this._options ??= {};
      this._options.dataBreakpoints = dataBreakpoints;
      this._game?.setDataBreakpoints(dataBreakpoints);
    }
    const actualBreakpoints =
      breakpoints && this._program?.pathToLocation
        ? Game.getActualBreakpoints(
            Object.entries(this._program.pathToLocation),
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
    const actualDataBreakpoints =
      dataBreakpoints && this._program?.dataLocations
        ? Game.getActualDataBreakpoints(
            this._program.dataLocations,
            dataBreakpoints,
            Object.keys(this._program.scripts)
          )
        : undefined;
    return messageType.response(message.id, {
      breakpoints: actualBreakpoints,
      functionBreakpoints: actualFunctionBreakpoints,
      dataBreakpoints: actualDataBreakpoints,
    });
  };

  protected handleLoadGame = async (
    messageType: typeof LoadGameMessage.type,
    message: LoadGameMessage.Request
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
    return messageType.response(message.id, {});
  };

  protected handleStartGame = async (
    messageType: typeof StartGameMessage.type,
    message: StartGameMessage.Request
  ) => {
    if (!this._program) {
      // wait for program to be loaded
      await new Promise<void>((resolve) => {
        this._loadListeners.add(resolve);
      });
    }
    await this.buildGame();
    const programCompiled = this._program?.compiled;
    const gameStarted = this._game?.start();
    const success = Boolean(programCompiled && gameStarted);
    if (success) {
      this._app?.start();
      return messageType.response(message.id, {});
    }
    return messageType.error(message.id, {
      code: 1,
      message: !programCompiled
        ? "The program contains errors that prevent it from being compiled"
        : !gameStarted
        ? `The game cannot be started from line ${
            (this._options?.startpoint?.line ?? 0) + 1
          } of ${this._options?.startpoint?.file?.split("/").at(-1)}`
        : "The game could not be started",
    });
  };

  protected handleStopGame = async (
    messageType: typeof StopGameMessage.type,
    message: StopGameMessage.Request
  ) => {
    await this.stopGame("quit");
    return messageType.response(message.id, {});
  };

  protected handlePauseGame = async (
    messageType: typeof PauseGameMessage.type,
    message: PauseGameMessage.Request
  ) => {
    if (this._app) {
      this._app.pause();
      return messageType.response(message.id, {});
    }
    return messageType.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  };

  protected handleUnpauseGame = async (
    messageType: typeof UnpauseGameMessage.type,
    message: UnpauseGameMessage.Request
  ) => {
    if (this._app) {
      this._app.unpause();
      return messageType.response(message.id, {});
    }
    return messageType.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  };

  protected handleStepGameClock = async (
    messageType: typeof StepGameClockMessage.type,
    message: StepGameClockMessage.Request
  ) => {
    const { seconds } = message.params;
    if (this._app) {
      this._app.skip(seconds);
      return messageType.response(message.id, {});
    }
    return messageType.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  };

  protected handleStepGame = async (
    messageType: typeof StepGameMessage.type,
    message: StepGameMessage.Request
  ) => {
    const { traversal } = message.params;
    if (this._game) {
      this._game.step(traversal);
      return messageType.response(message.id, {});
    }
    return messageType.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  };

  protected handleContinueGame = async (
    messageType: typeof ContinueGameMessage.type,
    message: ContinueGameMessage.Request
  ) => {
    if (this._game) {
      this._game.continue();
      return messageType.response(message.id, {});
    }
    return messageType.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  };

  protected handleGetGameScripts = async (
    messageType: typeof GetGameScriptsMessage.type,
    message: GetGameScriptsMessage.Request
  ) => {
    if (this._program) {
      const uris = Object.keys(this._program?.scripts || {});
      return messageType.response(message.id, { uris });
    }
    return messageType.error(message.id, {
      code: 1,
      message: "no program loaded",
    });
  };

  protected handleGetGameThreads = async (
    messageType: typeof GetGameThreadsMessage.type,
    message: GetGameThreadsMessage.Request
  ) => {
    if (this._game) {
      const threads = this._game.getThreads();
      return messageType.response(message.id, { threads });
    }
    return messageType.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  };

  protected handleGetGamePossibleBreakpointLocations = async (
    messageType: typeof GetGamePossibleBreakpointLocationsMessage.type,
    message: GetGamePossibleBreakpointLocationsMessage.Request
  ) => {
    const { search } = message.params;
    const program = this._game?.program || this._program;
    if (program) {
      const lines: number[] = [];
      const possibleLocations = Object.values(program.pathToLocation || {});
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
      return messageType.response(message.id, result);
    }
    return messageType.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  };

  protected handleGetGameStackTrace = async (
    messageType: typeof GetGameStackTraceMessage.type,
    message: GetGameStackTraceMessage.Request
  ) => {
    const { threadId, startFrame, levels } = message.params;
    if (this._game) {
      const result = this._game.getStackTrace(threadId, startFrame, levels);
      return messageType.response(message.id, result);
    }
    return messageType.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  };

  protected handleGetGameEvaluationContext = async (
    messageType: typeof GetGameEvaluationContextMessage.type,
    message: GetGameEvaluationContextMessage.Request
  ) => {
    if (this._game) {
      const context = this._game.getEvaluationContext();
      return messageType.response(message.id, { context });
    }
    return messageType.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  };

  protected handleGetGameVariables = async (
    messageType: typeof GetGameVariablesMessage.type,
    message: GetGameVariablesMessage.Request
  ) => {
    const { scope, variablesReference, value } = message.params;
    if (this._game) {
      if (scope === "temps") {
        const variables = this._game.getTempVariables();
        return messageType.response(message.id, { variables });
      } else if (scope === "vars") {
        const variables = this._game.getVarVariables();
        return messageType.response(message.id, { variables });
      } else if (scope === "lists") {
        const variables = this._game.getListVariables();
        return messageType.response(message.id, { variables });
      } else if (scope === "defines") {
        const variables = this._game.getDefineVariables();
        return messageType.response(message.id, { variables });
      } else if (scope === "children") {
        const variables = this._game.getChildVariables(variablesReference ?? 0);
        return messageType.response(message.id, { variables });
      } else if (scope === "value") {
        const variables = this._game.getValueVariables(value);
        return messageType.response(message.id, { variables });
      }
    }
    return messageType.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  };

  protected handleEnableGameDebug = async (
    messageType: typeof EnableGameDebugMessage.type,
    message: EnableGameDebugMessage.Request
  ) => {
    if (this._game) {
      this._game.startDebugging();
      return messageType.response(message.id, {});
    }
    return messageType.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  };

  protected handleDisableGameDebug = async (
    messageType: typeof DisableGameDebugMessage.type,
    message: DisableGameDebugMessage.Request
  ) => {
    if (this._game) {
      this._game.stopDebugging();
      return messageType.response(message.id, {});
    }
    return messageType.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  };

  protected handleLoadPreview = async (
    messageType: typeof LoadPreviewMessage.type,
    message: LoadPreviewMessage.Request
  ) => {
    const { type, textDocument, selectedRange } = message.params;
    if (type === "game") {
      const line = selectedRange?.start.line ?? 0;
      this.updatePreview(textDocument.uri, line);
      return messageType.response(message.id, {});
    }
    return undefined;
  };

  async stopGame(
    reason: "finished" | "quit" | "invalidated" | "error",
    error?: {
      message: string;
      location: DocumentLocation;
    }
  ) {
    if (this._app) {
      this._app.destroy(true);
      this._app = undefined;
    }
    if (this._game) {
      this._game.destroy();
      this._game = undefined;
    }
    this.showPlayButton();
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    this.emit(
      MessageProtocol.event,
      GameExitedMessage.type.notification({
        reason,
        error,
      })
    );
  }

  protected debouncedBuildGame = debounce(
    (preview?: { file: string; line: number }) => this.buildGame(preview),
    1000
  );

  async buildGame(preview?: { file: string; line: number }): Promise<void> {
    const options = this._options;
    const startpoint = options?.startpoint;
    const breakpoints = options?.breakpoints;
    const functionBreakpoints = options?.functionBreakpoints;
    if (!this._program || !this._program.compiled) {
      return;
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
      async (msg) => {
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
          if (this._game?.state === "running") {
            const error = {
              message,
              location,
            };
            await this.stopGame("error", error);
          }
        }
      }
    );
    this._game.connection.outgoing.addListener(
      StartedMessage.method,
      async (msg) => {
        if (StartedMessage.type.isNotification(msg)) {
          this.hidePlayButton();
          this.emit(
            MessageProtocol.event,
            GameStartedMessage.type.notification(msg.params)
          );
        }
      }
    );
    this._game.connection.outgoing.addListener(
      FinishedMessage.method,
      async (msg) => {
        if (FinishedMessage.type.isNotification(msg)) {
          await this.stopGame("finished");
        }
      }
    );
    this._game.connection.outgoing.addListener(
      StartedThreadMessage.method,
      (msg) => {
        if (StartedThreadMessage.type.isNotification(msg)) {
          this.emit(
            MessageProtocol.event,
            GameStartedThreadMessage.type.notification(msg.params)
          );
        }
      }
    );
    this._game.connection.outgoing.addListener(
      ExitedThreadMessage.method,
      (msg) => {
        if (ExitedThreadMessage.type.isNotification(msg)) {
          this.emit(
            MessageProtocol.event,
            GameExitedThreadMessage.type.notification(msg.params)
          );
        }
      }
    );
    this._game.connection.outgoing.addListener(
      ExecutedMessage.method,
      (msg) => {
        if (ExecutedMessage.type.isNotification(msg)) {
          this.emit(
            MessageProtocol.event,
            GameExecutedMessage.type.notification(msg.params)
          );
        }
      }
    );
    this._game.connection.outgoing.addListener(SteppedMessage.method, (msg) => {
      if (SteppedMessage.type.isNotification(msg)) {
        this.emit(
          MessageProtocol.event,
          GameSteppedMessage.type.notification(msg.params)
        );
      }
    });
    this._game.connection.outgoing.addListener(
      HitBreakpointMessage.method,
      (msg) => {
        if (HitBreakpointMessage.type.isNotification(msg)) {
          this.emit(
            MessageProtocol.event,
            GameHitBreakpointMessage.type.notification(msg.params)
          );
        }
      }
    );
    this._game.connection.outgoing.addListener(
      AwaitingInteractionMessage.method,
      (msg) => {
        if (AwaitingInteractionMessage.type.isNotification(msg)) {
          this.emit(
            MessageProtocol.event,
            GameAwaitingInteractionMessage.type.notification(msg.params)
          );
        }
      }
    );
    this._game.connection.outgoing.addListener(
      AutoAdvancedToContinueMessage.method,
      (msg) => {
        if (AutoAdvancedToContinueMessage.type.isNotification(msg)) {
          this.emit(
            MessageProtocol.event,
            GameAutoAdvancedToContinueMessage.type.notification(msg.params)
          );
        }
      }
    );
    this._game.connection.outgoing.addListener(
      ClickedToContinueMessage.method,
      (msg) => {
        if (ClickedToContinueMessage.type.isNotification(msg)) {
          this.emit(
            MessageProtocol.event,
            GameClickedToContinueMessage.type.notification(msg.params)
          );
        }
      }
    );
    this._game.connection.outgoing.addListener(
      ChosePathToContinueMessage.method,
      (msg) => {
        if (ChosePathToContinueMessage.type.isNotification(msg)) {
          this.emit(
            MessageProtocol.event,
            GameChosePathToContinueMessage.type.notification(msg.params)
          );
        }
      }
    );
    if (this._app) {
      this._app.destroy(true);
      this._app = undefined;
    }
    this._app = new Application(
      this._game,
      this.ref.gameView,
      this.ref.gameOverlay
    );
    await this._app.init();
  }

  async updatePreview(file: string, line: number) {
    if (this._app && !this._app.initialized && this._app.initializing) {
      await this._app.initializing;
    } else {
      if (
        !this._app ||
        !this._app.initialized ||
        !this._game ||
        (this._game.state === "previewing" &&
          (this._game.program.uri !== this._program?.uri ||
            this._game.program.version !== this._program?.version))
      ) {
        // If haven't built game yet, or programs have changed since last build, build game.
        await this.buildGame({ file, line });
      }
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
