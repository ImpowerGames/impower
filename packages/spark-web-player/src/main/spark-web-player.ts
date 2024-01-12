import { SparkDOMElement } from "../../../spark-dom/src";
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
import { LoadPreviewMessage } from "../../../spark-editor-protocol/src/protocols/preview/LoadPreviewMessage";
import { GameContext } from "../../../spark-engine/src/parser/classes/GameContext";
import { GameContextOptions } from "../../../spark-engine/src/parser/interfaces/GameContextOptions";
import { SparkProgram } from "../../../sparkdown/src/types/SparkProgram";
import { Component } from "../../../spec-component/src/component";
import Application from "../app/Application";
import spec from "./_spark-web-player";

export default class SparkWebPlayer extends Component(spec) {
  _context?: GameContext;

  _app?: Application;

  _debugging = false;

  _root?: SparkDOMElement;

  _programs: Record<string, SparkProgram> = {};

  _options?: {
    simulateFromProgram?: string;
    simulateFromLine?: number;
    startFromProgram?: string;
    startFromLine?: number;
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
        this._programs = {};
        programs.forEach((p) => {
          this._programs[p.uri] = p.program;
        });
        if (this._context) {
          this._context.dispose();
        }
        this._context = this.loadGame();
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
        const gameDOM = this.ref.sparkGame;
        if (this._context) {
          this._context.dispose();
        }
        this._context = this.loadGame();
        if (gameDOM && this._context) {
          this._app = new Application(gameDOM, this._context);
        }
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
        if (this._context) {
          this._context.dispose();
          this._context = undefined;
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
        if (this._context) {
          this._context.game.debug.startDebugging();
        }
      }
    }
  };

  protected handleDisableGameDebug = async (e: Event): Promise<void> => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (DisableGameDebugMessage.type.isRequest(message)) {
        if (this._context) {
          this._context.game.debug.stopDebugging();
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

  loadGame() {
    if (this._programs && this._options) {
      const programUris = Object.keys(this._programs);
      const programs = Object.values(this._programs);
      const options = this._options;
      if (!this._root) {
        this._root = SparkDOMElement.wrap(this.ref.sparkRoot!);
      }
      const simulateFromProgram = options.simulateFromProgram
        ? programUris.indexOf(options.simulateFromProgram)
        : undefined;
      const simulateFromLine = options.simulateFromLine;
      const startFromProgram = options.startFromProgram
        ? programUris.indexOf(options.startFromProgram)
        : undefined;
      const startFromLine = options.startFromLine;
      const gameContextOptions: GameContextOptions = {
        simulateFromProgram,
        simulateFromLine,
        startFromProgram,
        startFromLine,
        config: {
          ui: {
            root: this._root,
            createElement: (
              type: string,
              id: string,
              name: string,
              text?: string,
              style?: Record<string, string | null>,
              attributes?: Record<string, string | null>
            ) => {
              return new SparkDOMElement(
                type,
                id,
                name,
                text,
                style,
                attributes
              );
            },
          },
        },
      };
      const context = new GameContext(programs, gameContextOptions);
      context.game.logic.events.onExecuteCommand.addListener((_id, source) => {
        if (source) {
          window.dispatchEvent(
            new CustomEvent(DidExecuteGameCommandMessage.method, {
              bubbles: true,
              cancelable: true,
              composed: true,
              detail: DidExecuteGameCommandMessage.type.notification({
                textDocument: { uri: source.file },
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
              }),
            })
          );
        }
      });
      return context;
    }
    return undefined;
  }

  updatePreview(line: number) {
    if (!this._context) {
      this._context = this.loadGame();
    }
    if (this._context) {
      this._context.preview(line, this._debugging);
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "spark-web-player": SparkWebPlayer;
  }
}
