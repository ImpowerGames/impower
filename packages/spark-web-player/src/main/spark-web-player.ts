import { SparkDOMElement } from "../../../spark-dom/src";
import { LoadGameMessage } from "../../../spark-editor-protocol/src/protocols/game/LoadGameMessage";
import { PauseGameMessage } from "../../../spark-editor-protocol/src/protocols/game/PauseGameMessage";
import { StartGameMessage } from "../../../spark-editor-protocol/src/protocols/game/StartGameMessage";
import { StepGameMessage } from "../../../spark-editor-protocol/src/protocols/game/StepGameMessage";
import { StopGameMessage } from "../../../spark-editor-protocol/src/protocols/game/StopGameMessage";
import { UnpauseGameMessage } from "../../../spark-editor-protocol/src/protocols/game/UnpauseGameMessage";
import SparkElement from "../../../spark-element/src/core/spark-element";
import { Properties } from "../../../spark-element/src/types/properties";
import getAttributeNameMap from "../../../spark-element/src/utils/getAttributeNameMap";
import { SparkContext, SparkContextOptions } from "../../../spark-engine/src";
import { SparkProgram } from "../../../sparkdown/src/types/SparkProgram";
import Application from "../app/Application";
import component from "./_spark-web-player";

const DEFAULT_ATTRIBUTES = {
  ...getAttributeNameMap([]),
};

export default class SparkWebPlayer
  extends SparkElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override async define(
    tag = "spark-web-player",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  static override get attributes() {
    return DEFAULT_ATTRIBUTES;
  }

  override get component() {
    return component();
  }

  get sparkRootEl() {
    return this.getElementById("spark-root");
  }

  get sparkGameEl() {
    return this.getElementById("spark-game");
  }

  _context?: SparkContext;

  _app?: Application;

  protected override onConnected(): void {
    window.addEventListener(LoadGameMessage.method, this.handleLoadGame);
    window.addEventListener(StartGameMessage.method, this.handleStartGame);
    window.addEventListener(StopGameMessage.method, this.handleStopGame);
    window.addEventListener(PauseGameMessage.method, this.handlePauseGame);
    window.addEventListener(UnpauseGameMessage.method, this.handleUnpauseGame);
    window.addEventListener(StepGameMessage.method, this.handleStepGame);
  }

  protected override onDisconnected(): void {
    window.removeEventListener(LoadGameMessage.method, this.handleLoadGame);
    window.removeEventListener(StartGameMessage.method, this.handleStartGame);
    window.removeEventListener(StopGameMessage.method, this.handleStopGame);
    window.removeEventListener(PauseGameMessage.method, this.handlePauseGame);
    window.removeEventListener(
      UnpauseGameMessage.method,
      this.handleUnpauseGame
    );
    window.removeEventListener(StepGameMessage.method, this.handleStepGame);
  }

  protected handleLoadGame = async (e: Event): Promise<void> => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (LoadGameMessage.type.isRequest(message)) {
        const params = message.params;
        const programs = params.programs;
        const options = params.options;
        const programMap: Record<string, SparkProgram> = {};
        programs.forEach((p) => {
          programMap[p.name] = p.program;
        });
        this.loadGame(programMap, options);
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

  loadGame(
    programs: Record<string, SparkProgram>,
    options?: SparkContextOptions
  ) {
    const createElement = (type: string) => {
      return new SparkDOMElement(document.createElement(type));
    };
    const sparkRootEl = this.sparkRootEl;
    if (sparkRootEl) {
      this._context = new SparkContext(programs, {
        config: {
          ui: {
            root: new SparkDOMElement(sparkRootEl),
            createElement,
          },
          ...(options?.config || {}),
        },
        ...(options || {}),
      });
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "spark-web-player": SparkWebPlayer;
  }
}
