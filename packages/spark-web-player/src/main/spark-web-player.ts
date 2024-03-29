import { ConfigureGameMessage } from "../../../spark-editor-protocol/src/protocols/game/ConfigureGameMessage";
import { DidExecuteGameCommandMessage } from "../../../spark-editor-protocol/src/protocols/game/DidExecuteGameCommandMessage";
import { DisableGameDebugMessage } from "../../../spark-editor-protocol/src/protocols/game/DisableGameDebugMessage";
import { EnableGameDebugMessage } from "../../../spark-editor-protocol/src/protocols/game/EnableGameDebugMessage";
import { LoadGameMessage } from "../../../spark-editor-protocol/src/protocols/game/LoadGameMessage";
import { PauseGameMessage } from "../../../spark-editor-protocol/src/protocols/game/PauseGameMessage";
import { StartGameMessage } from "../../../spark-editor-protocol/src/protocols/game/StartGameMessage";
import { StepGameMessage } from "../../../spark-editor-protocol/src/protocols/game/StepGameMessage";
import { StopGameMessage } from "../../../spark-editor-protocol/src/protocols/game/StopGameMessage";
import { UnpauseGameMessage } from "../../../spark-editor-protocol/src/protocols/game/UnpauseGameMessage";
import { WillExecuteGameCommandMessage } from "../../../spark-editor-protocol/src/protocols/game/WillExecuteGameCommandMessage";
import { LoadPreviewMessage } from "../../../spark-editor-protocol/src/protocols/preview/LoadPreviewMessage";
import { GameBuilder } from "../../../spark-engine/src/builder/classes/GameBuilder";
import { DidExecuteMessage } from "../../../spark-engine/src/game/modules/logic/classes/messages/DidExecuteMessage";
import { WillExecuteMessage } from "../../../spark-engine/src/game/modules/logic/classes/messages/WillExecuteMessage";
import { SparkProgram } from "../../../sparkdown/src/types/SparkProgram";
import { Component } from "../../../spec-component/src/component";
import Application from "../app/Application";
import spec from "./_spark-web-player";

export default class SparkWebPlayer extends Component(spec) {
  _builder?: GameBuilder;

  _app?: Application;

  _debugging = false;

  _programs: SparkProgram[] = [];

  _programIndices: Record<string, number> = {};

  _options?: {
    waypoints?: { uri: string; line: number }[];
    startpoint?: { uri: string; line: number };
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
        const programs = params.programs;
        this._programs = [];
        this._programIndices = {};
        programs.forEach((p, index) => {
          this._programIndices![p.uri] = index;
          this._programs!.push(p.program);
        });
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
        this.buildGame(false);
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
        if (this._builder) {
          this._builder.game.destroy();
          this._builder = undefined;
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
        if (this._builder) {
          this._builder.game.module.debug.startDebugging();
        }
      }
    }
  };

  protected handleDisableGameDebug = async (e: Event): Promise<void> => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (DisableGameDebugMessage.type.isRequest(message)) {
        if (this._builder) {
          this._builder.game.module.debug.stopDebugging();
        }
      }
    }
  };

  protected handleLoadPreview = async (e: Event): Promise<void> => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (LoadPreviewMessage.type.isRequest(message)) {
        const { type, selectedRange } = message.params;
        if (type === "game") {
          const line = selectedRange?.start.line ?? 0;
          this.updatePreview(line);
          this.emit(
            LoadPreviewMessage.method,
            LoadPreviewMessage.type.response(message.id, null)
          );
        }
      }
    }
  };

  buildGame(preview: boolean): void {
    if (this._options) {
      const options = this._options;
      const waypoints = options.waypoints
        ?.filter((waypoint) => this._programIndices[waypoint.uri] != null)
        ?.map((waypoint) => ({
          program: this._programIndices[waypoint.uri]!,
          line: waypoint.line,
        }));
      const startpoint =
        options.startpoint &&
        this._programIndices[options.startpoint.uri] != null
          ? {
              program: this._programIndices[options.startpoint.uri]!,
              line: options.startpoint.line,
            }
          : undefined;
      const simulation = {
        waypoints,
        startpoint,
      };
      if (this._builder?.game) {
        this._builder.game.destroy();
      }
      this._builder = new GameBuilder(this._programs, {
        simulation,
        preview,
      });
      this._builder.game.connection.outgoing.addListener(
        "logic/willexecute",
        (msg) => {
          if (WillExecuteMessage.type.isNotification(msg)) {
            const source = msg.params.source;
            const programs = Object.keys(this._programIndices);
            if (source) {
              const uri = programs[source.file];
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
                        line: source.line,
                        character: source.to - source.from - 1,
                      },
                    },
                  })
                );
              }
            }
          }
        }
      );
      this._builder.game.connection.outgoing.addListener(
        "logic/didexecute",
        (msg) => {
          if (DidExecuteMessage.type.isNotification(msg)) {
            const source = msg.params.source;
            const programs = Object.keys(this._programIndices);
            if (source) {
              const uri = programs[source.file];
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
                        line: source.line,
                        character: source.to - source.from - 1,
                      },
                    },
                  })
                );
              }
            }
          }
        }
      );
      if (this._builder) {
        if (this._app) {
          this._app.destroy(true);
          this._app = undefined;
        }
        this._app = new Application(
          this._builder.game,
          this.ref.gameView,
          this.ref.gameOverlay
        );
      }
    }
    return undefined;
  }

  updatePreview(line: number) {
    if (!this._builder || this._builder.programs !== this._programs) {
      // If haven't built game yet, or programs have changed since last build, build game.
      this.buildGame(true);
    }
    if (this._builder) {
      this._builder.preview(line);
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "spark-web-player": SparkWebPlayer;
  }
}
