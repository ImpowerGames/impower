import { Component } from "../../../../../../packages/spec-component/src/component";
import throttle from "../../utils/throttle";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_preview-game-toolbar";

export default class PreviewGameToolbar extends Component(spec) {
  _controllingPlayback = 0;

  override onConnected() {
    this.ref.runToggleButton.addEventListener(
      "click",
      this.handleClickRunToggleButton
    );
    this.ref.stepBackwardButton?.addEventListener(
      "pointerdown",
      this.handlePointerDownStepBackwardButton
    );
    this.ref.stepBackwardButton?.addEventListener(
      "pointerup",
      this.handlePointerUpStepBackwardButton
    );
    this.ref.fastBackwardButton?.addEventListener(
      "pointerdown",
      this.handlePointerDownFastBackwardButton
    );
    this.ref.fastBackwardButton?.addEventListener(
      "pointerup",
      this.handlePointerUpFastBackwardButton
    );
    this.ref.pauseToggleButton?.addEventListener(
      "click",
      this.handleClickPauseToggleButton
    );
    this.ref.fastForwardButton?.addEventListener(
      "pointerdown",
      this.handlePointerDownFastForwardButton
    );
    this.ref.fastForwardButton?.addEventListener(
      "pointerup",
      this.handlePointerUpFastForwardButton
    );
    this.ref.stepForwardButton?.addEventListener(
      "pointerdown",
      this.handlePointerDownStepForwardButton
    );
    this.ref.stepForwardButton?.addEventListener(
      "pointerup",
      this.handlePointerUpStepForwardButton
    );
    this.ref.settingsDropdown?.addEventListener(
      "changed",
      this.handleSettingsDropdownChanged
    );
  }

  override onDisconnected() {
    this.ref.runToggleButton.removeEventListener(
      "click",
      this.handleClickRunToggleButton
    );
    this.ref.stepBackwardButton?.removeEventListener(
      "pointerdown",
      this.handlePointerDownStepBackwardButton
    );
    this.ref.stepBackwardButton?.removeEventListener(
      "pointerup",
      this.handlePointerUpStepBackwardButton
    );
    this.ref.fastBackwardButton?.removeEventListener(
      "pointerdown",
      this.handlePointerDownFastBackwardButton
    );
    this.ref.fastBackwardButton?.removeEventListener(
      "pointerup",
      this.handlePointerUpFastBackwardButton
    );
    this.ref.pauseToggleButton?.removeEventListener(
      "click",
      this.handleClickPauseToggleButton
    );
    this.ref.fastForwardButton?.removeEventListener(
      "pointerdown",
      this.handlePointerDownFastForwardButton
    );
    this.ref.fastForwardButton?.removeEventListener(
      "pointerup",
      this.handlePointerUpFastForwardButton
    );
    this.ref.stepForwardButton?.removeEventListener(
      "pointerdown",
      this.handlePointerDownStepForwardButton
    );
    this.ref.stepForwardButton?.removeEventListener(
      "pointerup",
      this.handlePointerUpStepForwardButton
    );
    this.ref.settingsDropdown?.removeEventListener(
      "changed",
      this.handleSettingsDropdownChanged
    );
  }

  handleClickRunToggleButton = (e: Event) => {
    Workspace.window.toggleGameRunning();
  };

  handlePointerDownStepBackwardButton = (e: Event) => {
    this.throttledStep(-10);
  };

  handlePointerUpStepBackwardButton = (e: Event) => {
    window.cancelAnimationFrame(this._controllingPlayback);
  };

  handlePointerDownFastBackwardButton = (e: Event) => {
    this.throttledStep(-100);
  };

  handlePointerUpFastBackwardButton = (e: Event) => {
    window.cancelAnimationFrame(this._controllingPlayback);
  };

  handleClickPauseToggleButton = (e: Event) => {
    Workspace.window.toggleGamePaused();
  };

  handlePointerDownFastForwardButton = (e: Event) => {
    this.throttledStep(100);
  };

  handlePointerUpFastForwardButton = (e: Event) => {
    window.cancelAnimationFrame(this._controllingPlayback);
  };

  handlePointerDownStepForwardButton = (e: Event) => {
    this.throttledStep(10);
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
    const store = this.stores.workspace.current;
    const paused = store.preview.modes.game.paused;
    if (deltaMS < 0) {
      if (!paused) {
        Workspace.window.pauseGame();
      }
    }
    const throttledStep = throttle(() => {
      Workspace.window.stepGame(deltaMS);
    }, 100);
    window.cancelAnimationFrame(this._controllingPlayback);
    const loop = () => {
      throttledStep();
      this._controllingPlayback = window.requestAnimationFrame(loop);
    };
    this._controllingPlayback = window.requestAnimationFrame(loop);
  }
}
