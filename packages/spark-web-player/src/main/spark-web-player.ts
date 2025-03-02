import { ConfigureGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/ConfigureGameMessage";
import { DidExecuteGameCommandMessage } from "@impower/spark-editor-protocol/src/protocols/game/DidExecuteGameCommandMessage";
import { DisableGameDebugMessage } from "@impower/spark-editor-protocol/src/protocols/game/DisableGameDebugMessage";
import { EnableGameDebugMessage } from "@impower/spark-editor-protocol/src/protocols/game/EnableGameDebugMessage";
import { LoadGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/LoadGameMessage";
import { PauseGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/PauseGameMessage";
import { StartGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/StartGameMessage";
import { StepGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/StepGameMessage";
import { StopGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/StopGameMessage";
import { UnpauseGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/UnpauseGameMessage";
import { WillExecuteGameCommandMessage } from "@impower/spark-editor-protocol/src/protocols/game/WillExecuteGameCommandMessage";
import { LoadPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/LoadPreviewMessage";
import { ConnectedPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/ConnectedPreviewMessage";
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { DidExecuteMessage } from "@impower/spark-engine/src/game/core/classes/messages/DidExecuteMessage";
import { RuntimeErrorMessage } from "@impower/spark-engine/src/game/core/classes/messages/RuntimeErrorMessage";
import { WillExecuteMessage } from "@impower/spark-engine/src/game/core/classes/messages/WillExecuteMessage";
import { ErrorType } from "@impower/spark-engine/src/game/core/types/ErrorType";
import { SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import { Component } from "../../../spec-component/src/component";
import Application from "../app/Application";
import spec from "./_spark-web-player";

export default class SparkWebPlayer extends Component(spec) {
  _game?: Game;

  _app?: Application;

  _debugging = false;

  _program?: SparkProgram;

  _options?: {
    waypoints?: { file: string; line: number }[];
    startpoint?: { file: string; line: number };
  };

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
    window.addEventListener(StepGameMessage.method, this.handleStepGame);
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
    window.removeEventListener(StepGameMessage.method, this.handleStepGame);
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
        const params = message.params;
        const settings = params.settings;
        this._options = settings;
        this.emit(
          ConfigureGameMessage.method,
          ConfigureGameMessage.type.response(message.id, null)
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
      }
    }
  };

  protected handleStartGame = async (e: Event): Promise<void> => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (StartGameMessage.type.isRequest(message)) {
        this.buildGame();
      }
    }
  };

  protected handleStopGame = async (e: Event): Promise<void> => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (StopGameMessage.type.isRequest(message)) {
        if (this._app) {
          this._app.destroy(true);
          this._app = undefined;
        }
        if (this._game) {
          this._game.destroy();
          this._game = undefined;
        }
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

  protected handleStepGame = async (e: Event): Promise<void> => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (StepGameMessage.type.isRequest(message)) {
        const { deltaMS } = message.params;
        if (this._app) {
          this._app.step(deltaMS);
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

  buildGame(preview?: { file: string; line: number }): void {
    const options = this._options;
    const waypoints = options?.waypoints;
    const startpoint = options?.startpoint;
    const simulation = {
      waypoints,
      startpoint,
    };
    if (!this._program || !this._program.compiled) {
      return;
    }
    if (this._game) {
      this._game.destroy();
    }
    this._game = new Game(this._program, {
      simulation,
      preview,
    });
    this._game.connection.outgoing.addListener(
      WillExecuteMessage.method,
      (msg) => {
        if (WillExecuteMessage.type.isNotification(msg)) {
          const source = msg.params.source;
          if (source) {
            const uri = source.file;
            if (uri) {
              this.emit(
                WillExecuteGameCommandMessage.method,
                WillExecuteGameCommandMessage.type.notification({
                  textDocument: { uri },
                  range: {
                    start: {
                      line: source.line,
                      character: 0,
                    },
                    end: {
                      line: source.line + 1,
                      character: 0,
                    },
                  },
                })
              );
            }
          }
        }
      }
    );
    this._game.connection.outgoing.addListener(
      DidExecuteMessage.method,
      (msg) => {
        if (DidExecuteMessage.type.isNotification(msg)) {
          const source = msg.params.source;
          if (source) {
            const uri = source.file;
            if (uri) {
              this.emit(
                DidExecuteGameCommandMessage.method,
                DidExecuteGameCommandMessage.type.notification({
                  textDocument: { uri },
                  range: {
                    start: {
                      line: source.line,
                      character: 0,
                    },
                    end: {
                      line: source.line + 1,
                      character: 0,
                    },
                  },
                })
              );
            }
          }
        }
      }
    );
    this._game.connection.outgoing.addListener(
      RuntimeErrorMessage.method,
      (msg) => {
        if (RuntimeErrorMessage.type.isNotification(msg)) {
          const type = msg.params.type;
          const message = msg.params.message;
          const source = msg.params.source;
          // TODO: Display message in on-screen debug console
          if (type === ErrorType.Error) {
            console.error(message, source);
          } else if (type === ErrorType.Warning) {
            console.warn(message, source);
          } else {
            console.log(message, source);
          }
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
    return undefined;
  }

  updatePreview(file: string, line: number) {
    if (!this._game || this._game.program !== this._program) {
      // If haven't built game yet, or programs have changed since last build, build game.
      this.buildGame({ file, line });
    }
    if (this._game) {
      this._game.preview(file, line);
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "spark-web-player": SparkWebPlayer;
  }
}
