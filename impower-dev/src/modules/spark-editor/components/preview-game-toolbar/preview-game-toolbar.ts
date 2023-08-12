import SEElement from "../../core/se-element";
import throttle from "../../utils/throttle";
import { Workspace } from "../../workspace/Workspace";
import component from "./_preview-game-toolbar";

export default class PreviewGameToolbar extends SEElement {
  static override async define(
    tag = "se-preview-game-toolbar",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component({ store: Workspace.window.state });
  }

  get settingsDropdownEl() {
    return this.getElementById("settings-dropdown");
  }

  get runToggleButtonEl() {
    return this.getElementById("run-toggle-button");
  }

  get stepBackwardButtonEl() {
    return this.getElementById("step-backward-button");
  }

  get fastBackwardButtonEl() {
    return this.getElementById("fast-backward-button");
  }

  get pauseToggleButtonEl() {
    return this.getElementById("pause-toggle-button");
  }

  get fastForwardButtonEl() {
    return this.getElementById("fast-forward-button");
  }

  get stepForwardButtonEl() {
    return this.getElementById("step-forward-button");
  }

  _controllingPlayback = 0;

  protected override onConnected(): void {
    this.runToggleButtonEl?.addEventListener(
      "click",
      this.handleClickRunToggleButton
    );
    this.stepBackwardButtonEl?.addEventListener(
      "pointerdown",
      this.handlePointerDownStepBackwardButton
    );
    this.stepBackwardButtonEl?.addEventListener(
      "pointerup",
      this.handlePointerUpStepBackwardButton
    );
    this.fastBackwardButtonEl?.addEventListener(
      "pointerdown",
      this.handlePointerDownFastBackwardButton
    );
    this.fastBackwardButtonEl?.addEventListener(
      "pointerup",
      this.handlePointerUpFastBackwardButton
    );
    this.pauseToggleButtonEl?.addEventListener(
      "click",
      this.handleClickPauseToggleButton
    );
    this.fastForwardButtonEl?.addEventListener(
      "pointerdown",
      this.handlePointerDownFastForwardButton
    );
    this.fastForwardButtonEl?.addEventListener(
      "pointerup",
      this.handlePointerUpFastForwardButton
    );
    this.stepForwardButtonEl?.addEventListener(
      "pointerdown",
      this.handlePointerDownStepForwardButton
    );
    this.stepForwardButtonEl?.addEventListener(
      "pointerup",
      this.handlePointerUpStepForwardButton
    );
    this.settingsDropdownEl?.addEventListener(
      "changed",
      this.handleSettingsDropdownChanged
    );
  }

  protected override onDisconnected(): void {
    this.runToggleButtonEl?.removeEventListener(
      "click",
      this.handleClickRunToggleButton
    );
    this.stepBackwardButtonEl?.removeEventListener(
      "pointerdown",
      this.handlePointerDownStepBackwardButton
    );
    this.stepBackwardButtonEl?.removeEventListener(
      "pointerup",
      this.handlePointerUpStepBackwardButton
    );
    this.fastBackwardButtonEl?.removeEventListener(
      "pointerdown",
      this.handlePointerDownFastBackwardButton
    );
    this.fastBackwardButtonEl?.removeEventListener(
      "pointerup",
      this.handlePointerUpFastBackwardButton
    );
    this.pauseToggleButtonEl?.removeEventListener(
      "click",
      this.handleClickPauseToggleButton
    );
    this.fastForwardButtonEl?.removeEventListener(
      "pointerdown",
      this.handlePointerDownFastForwardButton
    );
    this.fastForwardButtonEl?.removeEventListener(
      "pointerup",
      this.handlePointerUpFastForwardButton
    );
    this.stepForwardButtonEl?.removeEventListener(
      "pointerdown",
      this.handlePointerDownStepForwardButton
    );
    this.stepForwardButtonEl?.removeEventListener(
      "pointerup",
      this.handlePointerUpStepForwardButton
    );
    this.settingsDropdownEl?.removeEventListener(
      "changed",
      this.handleSettingsDropdownChanged
    );
  }

  handleClickRunToggleButton = (e: Event) => {
    Workspace.window.toggleGameRunning();
    this.render();
  };

  handlePointerDownStepBackwardButton = (e: Event) => {
    this.throttledStep(-10);
    this.render();
  };

  handlePointerUpStepBackwardButton = (e: Event) => {
    window.cancelAnimationFrame(this._controllingPlayback);
  };

  handlePointerDownFastBackwardButton = (e: Event) => {
    this.throttledStep(-100);
    this.render();
  };

  handlePointerUpFastBackwardButton = (e: Event) => {
    window.cancelAnimationFrame(this._controllingPlayback);
  };

  handleClickPauseToggleButton = (e: Event) => {
    Workspace.window.toggleGamePaused();
    this.render();
  };

  handlePointerDownFastForwardButton = (e: Event) => {
    this.throttledStep(100);
    this.render();
  };

  handlePointerUpFastForwardButton = (e: Event) => {
    window.cancelAnimationFrame(this._controllingPlayback);
  };

  handlePointerDownStepForwardButton = (e: Event) => {
    this.throttledStep(10);
    this.render();
  };

  handlePointerUpStepForwardButton = (e: Event) => {
    window.cancelAnimationFrame(this._controllingPlayback);
  };

  handleSettingsDropdownChanged = (e: Event) => {
    if (e instanceof CustomEvent) {
      if (e.detail.key === "debug") {
        if (e.detail.value) {
          Workspace.window.enableDebugging();
        } else {
          Workspace.window.disableDebugging();
        }
      }
    }
  };

  throttledStep(deltaMS: number) {
    if (deltaMS < 0) {
      const paused = Workspace.window.state.panes.preview.panels.game.paused;
      if (!paused) {
        Workspace.window.pauseGame();
      }
    }
    const throttledStep = throttle(() => {
      Workspace.window.stepGame(deltaMS);
    }, 100);
    window.cancelAnimationFrame(this._controllingPlayback);
    const loop = (): void => {
      throttledStep();
      this._controllingPlayback = window.requestAnimationFrame(loop);
    };
    this._controllingPlayback = window.requestAnimationFrame(loop);
  }
}
