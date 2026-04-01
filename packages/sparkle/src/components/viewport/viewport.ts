import { getCssSize } from "../../../../sparkle-style-transformer/src/utils/transformers";
import { SparkleComponent } from "../../core/sparkle-component";
import { getPixelValue } from "../../utils/getPixelValue";
import spec from "./_viewport";

const DEFAULT_TRANSFORMERS = {
  offset: getCssSize,
};

/**
 * Viewports fill the entire screen height and shrink to accommodate
 * on-screen virtual keyboards that would otherwise cover up content
 */
export default class Viewport extends SparkleComponent(
  spec,
  DEFAULT_TRANSFORMERS,
) {
  protected _offsetPx = 0;

  protected _pendingViewportUpdate?: number;

  protected _constrained = false;

  override onAttributeChanged(name: string, newValue: string) {
    if (name === this.attrs.offset) {
      this._offsetPx = getPixelValue(this.root, "offset");
    }
  }

  override onConnected() {
    window.visualViewport?.addEventListener(
      "scroll",
      this.handleViewportChange,
      {
        passive: true,
      },
    );
    window.visualViewport?.addEventListener(
      "resize",
      this.handleViewportChange,
      {
        passive: true,
      },
    );
    const constrainedEvent = this.constrainedEvent;
    if (constrainedEvent) {
      window.addEventListener(constrainedEvent, this.handleConstrained);
    }
    const unconstrainedEvent = this.unconstrainedEvent;
    if (unconstrainedEvent) {
      window.addEventListener(unconstrainedEvent, this.handleUnconstrained);
    }
  }

  override onDisconnected() {
    window.visualViewport?.removeEventListener(
      "scroll",
      this.handleViewportChange,
    );
    window.visualViewport?.removeEventListener(
      "resize",
      this.handleViewportChange,
    );
    const constrainedEvent = this.constrainedEvent;
    if (constrainedEvent) {
      window.removeEventListener(constrainedEvent, this.handleConstrained);
    }
    const unconstrainedEvent = this.unconstrainedEvent;
    if (unconstrainedEvent) {
      window.removeEventListener(unconstrainedEvent, this.handleUnconstrained);
    }
  }

  protected handleConstrained = (e: Event) => {
    this._constrained = true;
    if (window.visualViewport) {
      const maxHeight = `${window.visualViewport.height - this._offsetPx}px`;
      this.root.style.setProperty("max-height", maxHeight);
    }
  };

  protected handleUnconstrained = (e: Event) => {
    this._constrained = false;
    this.root.style.setProperty("max-height", null);
  };

  protected handleViewportChange = (e: Event) => {
    if (this._pendingViewportUpdate) {
      window.cancelAnimationFrame(this._pendingViewportUpdate);
    }
    this._pendingViewportUpdate = window.requestAnimationFrame(() => {
      const visualViewport = e.target as unknown as { height: number };
      if (visualViewport) {
        if (this._constrained) {
          const maxHeight = `${visualViewport.height - this._offsetPx}px`;
          this.root.style.setProperty("max-height", maxHeight);
        } else {
          this.root.style.setProperty("max-height", null);
        }
      }
      this._pendingViewportUpdate = undefined;
    });
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "s-viewport": Viewport;
  }
}
