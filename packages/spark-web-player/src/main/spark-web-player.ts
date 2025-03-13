import { ConfigureGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/ConfigureGameMessage";
import { ContinueGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/ContinueGameMessage";
import { DisableGameDebugMessage } from "@impower/spark-editor-protocol/src/protocols/game/DisableGameDebugMessage";
import { EnableGameDebugMessage } from "@impower/spark-editor-protocol/src/protocols/game/EnableGameDebugMessage";
import { GameAutoAdvancedToContinueMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameAutoAdvancedToContinueMessage";
import { GameAwaitingInteractionMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameAwaitingInteractionMessage";
import { GameChosePathToContinueMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameChosePathToContinueMessage";
import { GameClickedToContinueMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameClickedToContinueMessage";
import { GameContinuedMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameContinuedMessage";
import { GameExitedMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameExitedMessage";
import { GameExitedThreadMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameExitedThreadMessage";
import { GameHitBreakpointMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameHitBreakpointMessage";
import { GameStartedThreadMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameStartedThreadMessage";
import { GameSteppedMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameSteppedMessage";
import { GetGamePossibleBreakpointLocationsMessage } from "@impower/spark-editor-protocol/src/protocols/game/GetGamePossibleBreakpointLocationsMessage";
import { GetGameStackTraceMessage } from "@impower/spark-editor-protocol/src/protocols/game/GetGameStackTraceMessage";
import { GetGameThreadsMessage } from "@impower/spark-editor-protocol/src/protocols/game/GetGameThreadsMessage";
import { LoadGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/LoadGameMessage";
import { PauseGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/PauseGameMessage";
import { StartGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/StartGameMessage";
import { StepGameClockMessage } from "@impower/spark-editor-protocol/src/protocols/game/StepGameClockMessage";
import { StepGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/StepGameMessage";
import { StopGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/StopGameMessage";
import { UnpauseGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/UnpauseGameMessage";
import { ConnectedPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/ConnectedPreviewMessage";
import { LoadPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/LoadPreviewMessage";
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { AutoAdvancedToContinueMessage } from "@impower/spark-engine/src/game/core/classes/messages/AutoAdvancedToContinueMessage";
import { AwaitingInteractionMessage } from "@impower/spark-engine/src/game/core/classes/messages/AwaitingInteractionMessage";
import { ChosePathToContinueMessage } from "@impower/spark-engine/src/game/core/classes/messages/ChoosePathToContinueMessage";
import { ClickedToContinueMessage } from "@impower/spark-engine/src/game/core/classes/messages/ClickedToContinueMessage";
import { ContinuedMessage } from "@impower/spark-engine/src/game/core/classes/messages/ContinuedMessage";
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
    window.addEventListener(
      ConfigureGameMessage.method,
      this.handleConfigureGame
    );
    window.addEventListener(LoadGameMessage.method, this.handleLoadGame);
    window.addEventListener(StartGameMessage.method, this.handleStartGame);
    window.addEventListener(StopGameMessage.method, this.handleStopGame);
    window.addEventListener(PauseGameMessage.method, this.handlePauseGame);
    window.addEventListener(UnpauseGameMessage.method, this.handleUnpauseGame);
    window.addEventListener(
      StepGameClockMessage.method,
      this.handleStepGameClock
    );
    window.addEventListener(StepGameMessage.method, this.handleStepGame);
    window.addEventListener(
      ContinueGameMessage.method,
      this.handleContinueGame
    );
    window.addEventListener(
      GetGamePossibleBreakpointLocationsMessage.method,
      this.handleGetGamePossibleBreakpointLocations
    );
    window.addEventListener(
      GetGameStackTraceMessage.method,
      this.handleGetGameStackTrace
    );
    window.addEventListener(
      GetGameThreadsMessage.method,
      this.handleGetGameThreads
    );
    window.addEventListener(
      EnableGameDebugMessage.method,
      this.handleEnableGameDebug
    );
    window.addEventListener(
      DisableGameDebugMessage.method,
      this.handleDisableGameDebug
    );
    window.addEventListener(LoadPreviewMessage.method, this.handleLoadPreview);
    this.emit(
      ConnectedPreviewMessage.method,
      ConnectedPreviewMessage.type.notification({ type: "game" })
    );
  }

  override onDisconnected() {
    window.removeEventListener(
      ConfigureGameMessage.method,
      this.handleConfigureGame
    );
    window.removeEventListener(LoadGameMessage.method, this.handleLoadGame);
    window.removeEventListener(StartGameMessage.method, this.handleStartGame);
    window.removeEventListener(StopGameMessage.method, this.handleStopGame);
    window.removeEventListener(PauseGameMessage.method, this.handlePauseGame);
    window.removeEventListener(
      UnpauseGameMessage.method,
      this.handleUnpauseGame
    );
    window.removeEventListener(
      StepGameClockMessage.method,
      this.handleStepGameClock
    );
    window.removeEventListener(StepGameMessage.method, this.handleStepGame);
    window.removeEventListener(
      ContinueGameMessage.method,
      this.handleContinueGame
    );
    window.removeEventListener(
      GetGamePossibleBreakpointLocationsMessage.method,
      this.handleGetGamePossibleBreakpointLocations
    );
    window.removeEventListener(
      GetGameStackTraceMessage.method,
      this.handleGetGameStackTrace
    );
    window.removeEventListener(
      GetGameThreadsMessage.method,
      this.handleGetGameThreads
    );
    window.removeEventListener(
      EnableGameDebugMessage.method,
      this.handleEnableGameDebug
    );
    window.removeEventListener(
      DisableGameDebugMessage.method,
      this.handleDisableGameDebug
    );
    window.removeEventListener(
      LoadPreviewMessage.method,
      this.handleLoadPreview
    );
  }

  protected handleConfigureGame = async (e: Event): Promise<void> => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (ConfigureGameMessage.type.isRequest(message)) {
        const { startpoint, breakpoints, functionBreakpoints } = message.params;
        if (this._game) {
          if (startpoint) {
            this._options ??= {};
            this._options.startpoint = startpoint;
            this._game.setStartpoint(startpoint);
          }
          if (breakpoints) {
            this._options ??= {};
            this._options.breakpoints = breakpoints;
            this._game.setBreakpoints(breakpoints);
          }
          if (functionBreakpoints) {
            this._options ??= {};
            this._options.functionBreakpoints = functionBreakpoints;
            this._game.setFunctionBreakpoints(functionBreakpoints);
          }
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
        this.emit(
          ConfigureGameMessage.method,
          ConfigureGameMessage.type.response(message.id, {
            breakpoints: actualBreakpoints,
            functionBreakpoints: actualFunctionBreakpoints,
          })
        );
      }
    }
  };

  protected handleLoadGame = async (e: Event): Promise<void> => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (LoadGameMessage.type.isRequest(message)) {
        const params = message.params;
        this._program = params.program;
        this.emit(
          LoadGameMessage.method,
          LoadGameMessage.type.response(message.id, null)
        );
        this._loadListeners.forEach((callback) => {
          callback();
        });
        this._loadListeners.clear();
        if (this._game?.state === "running") {
          // Stop and restart game if we loaded a new game while the old game was running
          this.debouncedBuildGame();
        }
      }
    }
  };

  protected handleStartGame = async (e: Event): Promise<void> => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (StartGameMessage.type.isRequest(message)) {
        if (!this._program) {
          // wait for program to be loaded
          await new Promise<void>((resolve) => {
            this._loadListeners.add(resolve);
          });
        }
        const success = this.buildGame();
        this.emit(
          StartGameMessage.method,
          StartGameMessage.type.response(message.id, success)
        );
      }
    }
  };

  protected handleStopGame = async (e: Event): Promise<void> => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (StopGameMessage.type.isRequest(message)) {
        this.stopGame("quit");
        this.emit(
          StopGameMessage.method,
          StopGameMessage.type.response(message.id, null)
        );
      }
    }
  };

  protected handlePauseGame = async (e: Event): Promise<void> => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (PauseGameMessage.type.isRequest(message)) {
        if (this._app) {
          this._app.pause();
        }
      }
    }
  };

  protected handleUnpauseGame = async (e: Event): Promise<void> => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (UnpauseGameMessage.type.isRequest(message)) {
        if (this._app) {
          this._app.unpause();
        }
      }
    }
  };

  protected handleStepGameClock = async (e: Event): Promise<void> => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (StepGameClockMessage.type.isRequest(message)) {
        const { deltaMS } = message.params;
        if (this._app) {
          this._app.step(deltaMS);
        }
      }
    }
  };

  protected handleStepGame = async (e: Event): Promise<void> => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (StepGameMessage.type.isRequest(message)) {
        const { traversal } = message.params;
        if (this._game) {
          this._game.step(traversal);
        }
      }
    }
  };

  protected handleContinueGame = async (e: Event): Promise<void> => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (ContinueGameMessage.type.isRequest(message)) {
        if (this._game) {
          this._game.continue();
        }
      }
    }
  };

  protected handleGetGameThreads = async (e: Event): Promise<void> => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (GetGameThreadsMessage.type.isRequest(message)) {
        if (this._game) {
          const threads = this._game.getThreads();
          this.emit(
            GetGameThreadsMessage.method,
            GetGameThreadsMessage.type.response(message.id, { threads })
          );
        } else {
          console.error("no game loaded");
        }
      }
    }
  };

  protected handleGetGamePossibleBreakpointLocations = async (
    e: Event
  ): Promise<void> => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (GetGamePossibleBreakpointLocationsMessage.type.isRequest(message)) {
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
          this.emit(
            GetGamePossibleBreakpointLocationsMessage.method,
            GetGamePossibleBreakpointLocationsMessage.type.response(
              message.id,
              { lines }
            )
          );
        } else {
          console.error("no program loaded");
        }
      }
    }
  };

  protected handleGetGameStackTrace = async (e: Event): Promise<void> => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (GetGameStackTraceMessage.type.isRequest(message)) {
        const { threadId, startFrame, levels } = message.params;
        if (this._game) {
          const result = this._game.getStackTrace(threadId, startFrame, levels);
          this.emit(
            GetGameStackTraceMessage.method,
            GetGameStackTraceMessage.type.response(message.id, result)
          );
        }
      }
    }
  };

  protected handleEnableGameDebug = async (e: Event): Promise<void> => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (EnableGameDebugMessage.type.isRequest(message)) {
        if (this._game) {
          this._game.startDebugging();
        }
      }
    }
  };

  protected handleDisableGameDebug = async (e: Event): Promise<void> => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (DisableGameDebugMessage.type.isRequest(message)) {
        if (this._game) {
          this._game.stopDebugging();
        }
      }
    }
  };

  protected handleLoadPreview = async (e: Event): Promise<void> => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (LoadPreviewMessage.type.isRequest(message)) {
        const { type, textDocument, selectedRange } = message.params;
        if (type === "game") {
          const line = selectedRange?.start.line ?? 0;
          this.updatePreview(textDocument.uri, line);
          this.emit(
            LoadPreviewMessage.method,
            LoadPreviewMessage.type.response(message.id, null)
          );
        }
      }
    }
  };

  stopGame(
    reason: "finished" | "quit" | "invalidated" | "error",
    error?: {
      message: string;
      location: DocumentLocation;
    }
  ) {
    this.emit(
      GameExitedMessage.type.method,
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
            GameStartedThreadMessage.type.method,
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
            GameExitedThreadMessage.type.method,
            GameExitedThreadMessage.type.notification({
              threadId,
            })
          );
        }
      }
    );
    this._game.connection.outgoing.addListener(
      ContinuedMessage.method,
      (msg) => {
        if (ContinuedMessage.type.isNotification(msg)) {
          const { location } = msg.params;
          this.emit(
            GameContinuedMessage.type.method,
            GameContinuedMessage.type.notification({
              location,
            })
          );
        }
      }
    );
    this._game.connection.outgoing.addListener(SteppedMessage.method, (msg) => {
      if (SteppedMessage.type.isNotification(msg)) {
        const { location } = msg.params;
        this.emit(
          GameSteppedMessage.type.method,
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
            GameHitBreakpointMessage.type.method,
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
            GameAwaitingInteractionMessage.type.method,
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
            GameAutoAdvancedToContinueMessage.type.method,
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
            GameClickedToContinueMessage.type.method,
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
            GameChosePathToContinueMessage.type.method,
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
