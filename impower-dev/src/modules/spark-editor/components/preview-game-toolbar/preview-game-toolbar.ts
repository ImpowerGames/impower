import type Button from "../../../../../../packages/sparkle/src/components/button/button";
import { Component } from "../../../../../../packages/spec-component/src/component";
import throttle from "../../utils/throttle";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_preview-game-toolbar";

export default class PreviewGameToolbar extends Component(spec) {
  _controllingPlayback = 0;

  override onConnected() {
    this.refs.runToggleButton?.addEventListener(
      "click",
      this.handleClickRunToggleButton
    );
    this.refs.modeButton?.addEventListener("click", this.handleClickModeButton);
    this.refs.stepBackwardButton?.addEventListener(
      "pointerdown",
      this.handlePointerDownStepBackwardButton
    );
    this.refs.stepBackwardButton?.addEventListener(
      "pointerup",
      this.handlePointerUpStepBackwardButton
    );
    this.refs.fastBackwardButton?.addEventListener(
      "pointerdown",
      this.handlePointerDownFastBackwardButton
    );
    this.refs.fastBackwardButton?.addEventListener(
      "pointerup",
      this.handlePointerUpFastBackwardButton
    );
    this.refs.pauseToggleButton?.addEventListener(
      "click",
      this.handleClickPauseToggleButton
    );
    this.refs.fastForwardButton?.addEventListener(
      "pointerdown",
      this.handlePointerDownFastForwardButton
    );
    this.refs.fastForwardButton?.addEventListener(
      "pointerup",
      this.handlePointerUpFastForwardButton
    );
    this.refs.stepForwardButton?.addEventListener(
      "pointerdown",
      this.handlePointerDownStepForwardButton
    );
    this.refs.stepForwardButton?.addEventListener(
      "pointerup",
      this.handlePointerUpStepForwardButton
    );
    this.refs.settingsDropdown?.addEventListener(
      "changed",
      this.handleSettingsDropdownChanged
    );
  }

  override onDisconnected() {
    this.refs.runToggleButton?.removeEventListener(
      "click",
      this.handleClickRunToggleButton
    );
    this.refs.modeButton?.removeEventListener(
      "click",
      this.handleClickModeButton
    );
    this.refs.stepBackwardButton?.removeEventListener(
      "pointerdown",
      this.handlePointerDownStepBackwardButton
    );
    this.refs.stepBackwardButton?.removeEventListener(
      "pointerup",
      this.handlePointerUpStepBackwardButton
    );
    this.refs.fastBackwardButton?.removeEventListener(
      "pointerdown",
      this.handlePointerDownFastBackwardButton
    );
    this.refs.fastBackwardButton?.removeEventListener(
      "pointerup",
      this.handlePointerUpFastBackwardButton
    );
    this.refs.pauseToggleButton?.removeEventListener(
      "click",
      this.handleClickPauseToggleButton
    );
    this.refs.fastForwardButton?.removeEventListener(
      "pointerdown",
      this.handlePointerDownFastForwardButton
    );
    this.refs.fastForwardButton?.removeEventListener(
      "pointerup",
      this.handlePointerUpFastForwardButton
    );
    this.refs.stepForwardButton?.removeEventListener(
      "pointerdown",
      this.handlePointerDownStepForwardButton
    );
    this.refs.stepForwardButton?.removeEventListener(
      "pointerup",
      this.handlePointerUpStepForwardButton
    );
    this.refs.settingsDropdown?.removeEventListener(
      "changed",
      this.handleSettingsDropdownChanged
    );
  }

  handleClickRunToggleButton = (e: Event) => {
    Workspace.window.toggleGameRunning();
  };

  handleClickModeButton = (e: Event) => {
    (this.refs.modeButton as Button)?.emitChange("screenplay");
  };

  handlePointerDownStepBackwardButton = (e: Event) => {
    this.throttledStep(-0.01);
  };

  handlePointerUpStepBackwardButton = (e: Event) => {
    window.cancelAnimationFrame(this._controllingPlayback);
  };

  handlePointerDownFastBackwardButton = (e: Event) => {
    this.throttledStep(-0.1);
  };

  handlePointerUpFastBackwardButton = (e: Event) => {
    window.cancelAnimationFrame(this._controllingPlayback);
  };

  handleClickPauseToggleButton = (e: Event) => {
    Workspace.window.toggleGamePaused();
  };

  handlePointerDownFastForwardButton = (e: Event) => {
    this.throttledStep(0.1);
  };

  handlePointerUpFastForwardButton = (e: Event) => {
    window.cancelAnimationFrame(this._controllingPlayback);
  };

  handlePointerDownStepForwardButton = (e: Event) => {
    this.throttledStep(0.01);
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

  throttledStep(seconds: number) {
    const store = this.stores.workspace.current;
    const paused = store.preview.modes.game.paused;
    if (seconds < 0) {
      if (!paused) {
        Workspace.window.pauseGame();
      }
    }
    const throttledStep = throttle(() => {
      Workspace.window.stepGameClock(seconds);
    }, 100);
    window.cancelAnimationFrame(this._controllingPlayback);
    const loop = () => {
      throttledStep();
      this._controllingPlayback = window.requestAnimationFrame(loop);
    };
    this._controllingPlayback = window.requestAnimationFrame(loop);
  }
}
