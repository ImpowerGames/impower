import {
  getCssColor,
  getCssSize,
} from "../../../../sparkle-style-transformer/src/utils/transformers";
import { SparkleComponent } from "../../core/sparkle-component";
import spec from "./_split-pane";

const RESIZING_EVENT = "resizing";
const RESIZED_EVENT = "resized";

const DEFAULT_TRANSFORMERS = {
  "min-panel-width": getCssSize,
  "min-panel-height": getCssSize,
  "resizer-color": getCssColor,
  "resizer-width": getCssSize,
  "divider-color": getCssColor,
  "divider-opacity": (v: string) => v,
  "divider-offset": getCssSize,
  "divider-width": getCssSize,
  "indicator-color": getCssColor,
  "indicator-width": getCssSize,
  "initial-size": getCssSize,
  step: getCssSize,
};

/**
 * Split Panes display two panels side-by-side and allows the user to adjust their size relative to one another.
 */
export default class SplitPane extends SparkleComponent(
  spec,
  DEFAULT_TRANSFORMERS,
) {
  override onConnected() {
    const revealEvent = this.revealEvent;
    if (revealEvent) {
      window.addEventListener(revealEvent, this.handleRevealEvent);
    }
    const unrevealEvent = this.unrevealEvent;
    if (unrevealEvent) {
      window.addEventListener(unrevealEvent, this.handleUnrevealEvent);
    }
    this.refs.divider.addEventListener("keydown", this.handleKeyDownDivider);
    this.refs.resize.addEventListener(
      "pointerdown",
      this.handlePointerDownResize,
    );
    this.refs.resize.addEventListener("pointerup", this.handlePointerUpResize);
  }

  override onDisconnected() {
    const revealEvent = this.revealEvent;
    if (revealEvent) {
      window.removeEventListener(revealEvent, this.handleRevealEvent);
    }
    const unrevealEvent = this.unrevealEvent;
    if (unrevealEvent) {
      window.removeEventListener(unrevealEvent, this.handleUnrevealEvent);
    }
    this.refs.divider.removeEventListener("keydown", this.handleKeyDownDivider);
    this.refs.resize.removeEventListener(
      "pointerdown",
      this.handlePointerDownResize,
    );
    this.refs.resize.removeEventListener(
      "pointerup",
      this.handlePointerUpResize,
    );
  }

  handleRevealEvent = () => {
    this.reveal = true;
  };

  handleUnrevealEvent = () => {
    this.reveal = false;
  };

  handleKeyDownDivider = (e: KeyboardEvent) => {
    const vertical = this.vertical;
    const step = this.step || "32px";
    const resizeEl = this.refs.resize;
    if (resizeEl) {
      if (vertical) {
        if (e.key === "ArrowUp") {
          resizeEl.style.height = `calc(${resizeEl.offsetHeight}px - ${step})`;
        }
        if (e.key === "ArrowDown") {
          resizeEl.style.height = `calc(${resizeEl.offsetHeight}px + ${step})`;
        }
      } else {
        if (e.key === "ArrowLeft") {
          resizeEl.style.width = `calc(${resizeEl.offsetWidth}px - ${step})`;
        }
        if (e.key === "ArrowRight") {
          resizeEl.style.width = `calc(${resizeEl.offsetWidth}px + ${step})`;
        }
      }
    }
  };

  handlePointerDownResize = (e: PointerEvent) => {
    this.emit(RESIZING_EVENT);
  };

  handlePointerUpResize = (e: PointerEvent) => {
    this.emit(RESIZED_EVENT);
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "s-split-pane": SplitPane;
  }
}
