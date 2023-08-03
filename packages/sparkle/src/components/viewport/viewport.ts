import { Properties } from "../../../../spark-element/src/types/properties";
import getAttributeNameMap from "../../../../spark-element/src/utils/getAttributeNameMap";
import { getKeys } from "../../../../spark-element/src/utils/getKeys";
import getCssSize from "../../../../sparkle-style-transformer/src/utils/getCssSize";
import SparkleElement, {
  DEFAULT_SPARKLE_ATTRIBUTES,
  DEFAULT_SPARKLE_TRANSFORMERS,
} from "../../core/sparkle-element";
import { SizeName } from "../../types/sizeName";
import { getPixelValue } from "../../utils/getPixelValue";
import component from "./_viewport";

const DEFAULT_TRANSFORMERS = {
  ...DEFAULT_SPARKLE_TRANSFORMERS,
  offset: getCssSize,
};

const DEFAULT_ATTRIBUTES = {
  ...DEFAULT_SPARKLE_ATTRIBUTES,
  ...getAttributeNameMap([
    "constrained-event",
    "unconstrained-event",
    ...getKeys(DEFAULT_TRANSFORMERS),
  ]),
};

/**
 * Viewports fill the entire screen height and shrink to accommodate
 * on-screen virtual keyboards that would otherwise cover up content
 */
export default class Viewport
  extends SparkleElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override tagName = "s-viewport";

  static override get attributes() {
    return DEFAULT_ATTRIBUTES;
  }

  override get transformers() {
    return DEFAULT_TRANSFORMERS;
  }

  static override async define(
    tagName?: string,
    dependencies?: Record<string, string>,
    useShadowDom = true
  ): Promise<CustomElementConstructor> {
    return super.define(tagName, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }

  override transformCss(css: string) {
    return Viewport.augmentCss(css);
  }

  /**
   * The viewport will be constrained when this event is fired
   */
  get constrainedEvent(): string | null {
    return this.getStringAttribute(Viewport.attributes.constrainedEvent);
  }
  set constrainedEvent(value) {
    this.setStringAttribute(Viewport.attributes.constrainedEvent, value);
  }

  /**
   * The viewport will be unconstrained when this event is fired
   */
  get unconstrainedEvent(): string | null {
    return this.getStringAttribute(Viewport.attributes.unconstrainedEvent);
  }
  set unconstrainedEvent(value) {
    this.setStringAttribute(Viewport.attributes.unconstrainedEvent, value);
  }

  /**
   * Determines how much the viewport should be offset
   * in addition to the height of the virtual keyboard
   */
  get offset(): SizeName | null {
    return this.getStringAttribute(Viewport.attributes.offset);
  }
  set offset(value) {
    this.setStringAttribute(Viewport.attributes.offset, value);
  }

  protected _offsetPx = 0;

  protected _pendingViewportUpdate?: number;

  protected _constrained = false;

  protected override onAttributeChanged(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    if (name === Viewport.attributes.offset) {
      this._offsetPx = getPixelValue(this.root, "offset");
    }
  }

  protected override onConnected(): void {
    window.visualViewport?.addEventListener(
      "scroll",
      this.handleViewportChange,
      {
        passive: true,
      }
    );
    window.visualViewport?.addEventListener(
      "resize",
      this.handleViewportChange,
      {
        passive: true,
      }
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

  protected override onDisconnected(): void {
    window.visualViewport?.removeEventListener(
      "scroll",
      this.handleViewportChange
    );
    window.visualViewport?.removeEventListener(
      "resize",
      this.handleViewportChange
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

  protected handleConstrained = (e: Event): void => {
    this._constrained = true;
    if (window.visualViewport) {
      const maxHeight = `${window.visualViewport.height - this._offsetPx}px`;
      this.root.style.setProperty("max-height", maxHeight);
    }
  };

  protected handleUnconstrained = (e: Event): void => {
    this._constrained = false;
    this.root.style.setProperty("max-height", null);
  };

  protected handleViewportChange = (event: Event) => {
    if (this._pendingViewportUpdate) {
      window.cancelAnimationFrame(this._pendingViewportUpdate);
    }
    this._pendingViewportUpdate = window.requestAnimationFrame(() => {
      const visualViewport = event.target as unknown as { height: number };
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
