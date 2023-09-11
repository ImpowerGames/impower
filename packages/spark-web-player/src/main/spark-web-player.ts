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
import SparkContext from "../../../spark-engine/src/parser/classes/SparkContext";
import { SparkContextOptions } from "../../../spark-engine/src/parser/interfaces/SparkContextOptions";
import { previewLine } from "../../../spark-engine/src/parser/utils/previewLine";
import { SparkProgram } from "../../../sparkdown/src/types/SparkProgram";
import { Component } from "../../../spec-component/src/component";
import Application from "../app/Application";
import spec from "./_spark-web-player";

export default class SparkWebPlayer extends Component(spec) {
  get sparkRootEl() {
    return this.getElementById("spark-root");
  }

  get sparkGameEl() {
    return this.getElementById("spark-game");
  }

  _context?: SparkContext;

  _app?: Application;

  _debugging = false;

  _root?: SparkDOMElement;

  _programs: Record<string, SparkProgram> = {};

  _options?: SparkContextOptions;

  override onConnected(): void {
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

  override onDisconnected(): void {
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
        const gameDOM = this.sparkGameEl;
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
    const programs = this._programs;
    const options = this._options;
    if (programs && options) {
      const createElement = (type: string) => {
        return new SparkDOMElement(document.createElement(type));
      };
      if (!this._root) {
        this._root = new SparkDOMElement(this.sparkRootEl!);
      }
      const context = new SparkContext(programs, {
        config: {
          ui: {
            root: this._root,
            createElement,
          },
          ...(options?.config || {}),
        },
        ...(options || {}),
      });
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
                    character: source.to - source.from,
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
      previewLine(this._context, line, true, this._debugging);
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "spark-web-player": SparkWebPlayer;
  }
}
