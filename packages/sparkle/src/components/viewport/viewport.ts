import getCssSize from "../../../../sparkle-style-transformer/src/utils/getCssSize";
import SparkleElement, {
  DEFAULT_SPARKLE_ATTRIBUTES,
  DEFAULT_SPARKLE_TRANSFORMERS,
} from "../../core/sparkle-element";
import { Properties } from "../../types/properties";
import { SizeName } from "../../types/sizeName";
import { getAttributeNameMap } from "../../utils/getAttributeNameMap";
import { getKeys } from "../../utils/getKeys";
import { getPixelValue } from "../../utils/getPixelValue";
import css from "./viewport.css";
import html from "./viewport.html";

const DEFAULT_TRANSFORMERS = {
  ...DEFAULT_SPARKLE_TRANSFORMERS,
  offset: getCssSize,
};

const DEFAULT_ATTRIBUTES = {
  ...DEFAULT_SPARKLE_ATTRIBUTES,
  ...getAttributeNameMap([...getKeys(DEFAULT_TRANSFORMERS)]),
};

/**
 * Viewports fill the entire screen height and shrink if necessary
 * to accommodate on-screen virtual keyboards that would otherwise cover up content
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

  override get html() {
    return html;
  }

  override get css() {
    return Viewport.augmentCss(css);
  }

  /**
   * Determines how much the viewport should be offset in addition to the height of the virtual keyboard
   */
  get offset(): SizeName | null {
    return this.getStringAttribute(Viewport.attributes.offset);
  }
  set offset(value) {
    this.setStringAttribute(Viewport.attributes.offset, value);
  }

  protected _offsetPx = 0;

  protected _pendingViewportUpdate?: number;

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
  }

  handleViewportChange = (event: Event) => {
    if (this._pendingViewportUpdate) {
      window.cancelAnimationFrame(this._pendingViewportUpdate);
    }
    this._pendingViewportUpdate = window.requestAnimationFrame(() => {
      const visualViewport = event.target as unknown as { height: number };
      if (visualViewport) {
        this.root.style.maxHeight = `${
          visualViewport.height - this._offsetPx
        }px`;
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
