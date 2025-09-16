import {
  getCssColor,
  getCssSize,
} from "../../../../sparkle-style-transformer/src/utils/transformers";
import { RefMap } from "../../../../spec-component/src/component";
import { Properties } from "../../../../spec-component/src/types/Properties";
import getAttributeNameMap from "../../../../spec-component/src/utils/getAttributeNameMap";
import getKeys from "../../../../spec-component/src/utils/getKeys";
import SparkleElement, {
  DEFAULT_SPARKLE_ATTRIBUTES,
  DEFAULT_SPARKLE_TRANSFORMERS,
} from "../../core/sparkle-element";
import { ColorName } from "../../types/colorName";
import { SizeName } from "../../types/sizeName";
import spec from "./_split-pane";

const RESIZING_EVENT = "resizing";
const RESIZED_EVENT = "resized";

const DEFAULT_TRANSFORMERS = {
  ...DEFAULT_SPARKLE_TRANSFORMERS,
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

const DEFAULT_ATTRIBUTES = {
  ...DEFAULT_SPARKLE_ATTRIBUTES,
  ...getAttributeNameMap([
    "vertical",
    "responsive",
    "primary",
    "reveal",
    "reveal-event",
    "unreveal-event",
    ...getKeys(DEFAULT_TRANSFORMERS),
  ]),
};

/**
 * Split Panes display two panels side-by-side and allows the user to adjust their size relative to one another.
 */
export default class SplitPane
  extends SparkleElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override get tag() {
    return spec.tag;
  }

  override get html() {
    return spec.html({
      graphics: this.graphics,
      stores: this.stores,
      context: this.context,
      props: this.props,
    });
  }

  override get css() {
    return spec.css;
  }

  override get selectors() {
    return spec.selectors;
  }

  override get refs() {
    return super.refs as RefMap<typeof this.selectors>;
  }

  static override get attrs() {
    return DEFAULT_ATTRIBUTES;
  }

  override get transformers() {
    return DEFAULT_TRANSFORMERS;
  }

  /**
   * The initial size of the start panel.
   *
   * Defaults to `50vw` when horizontal and `50vh` when vertical.
   */
  get initialSize(): SizeName | string | null {
    return this.getStringAttribute(SplitPane.attrs.initialSize);
  }
  set initialSize(value) {
    this.setStringAttribute(SplitPane.attrs.initialSize, value);
  }

  /**
   * The smallest width that the panels can be.
   */
  get minPanelWidth(): SizeName | string | null {
    return this.getStringAttribute(SplitPane.attrs.minPanelWidth);
  }
  set minPanelWidth(value) {
    this.setStringAttribute(SplitPane.attrs.minPanelWidth, value);
  }

  /**
   * The smallest height that the panels can be.
   */
  get minPanelHeight(): SizeName | string | null {
    return this.getStringAttribute(SplitPane.attrs.minPanelHeight);
  }
  set minPanelHeight(value) {
    this.setStringAttribute(SplitPane.attrs.minPanelHeight, value);
  }

  /**
   * Automatically change pane of panels when they cannot fit side-by-side.
   *
   * Set to `slide-left`, to slide the non-primary panel off the left side of the screen, when out of space.
   * Set to `slide-right`, to slide the non-primary panel off the right side of the screen, when out of space.
   * Set to `slide-up`, to slide the non-primary panel off the top side of the screen, when out of space.
   * Set to `slide-down`, to slide the non-primary panel off the bottom side of the screen, when out of space.
   * Set to `hide`, to hide the non-primary panel, when out of space.
   *
   * When not provided, defaults to `slide-down`
   */
  get responsive(): "hide" | null {
    return this.getStringAttribute(SplitPane.attrs.responsive);
  }
  set responsive(value) {
    this.setStringAttribute(SplitPane.attrs.responsive, value);
  }

  /**
   * The primary panel.
   */
  get primary(): "start" | "end" | null {
    return this.getStringAttribute(SplitPane.attrs.primary);
  }
  set primary(value) {
    this.setStringAttribute(SplitPane.attrs.primary, value);
  }

  /**
   * Draws the split panel in a vertical orientation with the start and end panels stacked.
   */
  get vertical(): boolean {
    return this.getBooleanAttribute(SplitPane.attrs.vertical);
  }
  set vertical(value) {
    this.setStringAttribute(SplitPane.attrs.vertical, value);
  }

  /**
   * The color of the area in which drag events will be detected.
   */
  get resizerColor(): SizeName | string | null {
    return this.getStringAttribute(SplitPane.attrs.resizerColor);
  }
  set resizerColor(value) {
    this.setStringAttribute(SplitPane.attrs.resizerColor, value);
  }

  /**
   * The width of the area in which drag events will be detected.
   */
  get resizerWidth(): SizeName | string | null {
    return this.getStringAttribute(SplitPane.attrs.resizerWidth);
  }
  set resizerWidth(value) {
    this.setStringAttribute(SplitPane.attrs.resizerWidth, value);
  }

  /**
   * The color of the divider between the two panels.
   */
  get dividerColor(): ColorName | string | null {
    return this.getStringAttribute(SplitPane.attrs.dividerColor);
  }
  set dividerColor(value) {
    this.setStringAttribute(SplitPane.attrs.dividerColor, value);
  }

  /**
   * The opacity of the divider between the two panels.
   */
  get dividerOpacity(): string | null {
    return this.getStringAttribute(SplitPane.attrs.dividerOpacity);
  }
  set dividerOpacity(value) {
    this.setStringAttribute(SplitPane.attrs.dividerOpacity, value);
  }

  /**
   * The offset of the divider between the two panels.
   */
  get dividerOffset(): SizeName | string | null {
    return this.getStringAttribute(SplitPane.attrs.dividerOffset);
  }
  set dividerOffset(value) {
    this.setStringAttribute(SplitPane.attrs.dividerOffset, value);
  }

  /**
   * The width of the divider between the two panels.
   */
  get dividerWidth(): SizeName | string | null {
    return this.getStringAttribute(SplitPane.attrs.dividerWidth);
  }
  set dividerWidth(value) {
    this.setStringAttribute(SplitPane.attrs.dividerWidth, value);
  }

  /**
   * The color of the indicator that appears when hovering or dragging the resizer.
   */
  get indicatorColor(): SizeName | string | null {
    return this.getStringAttribute(SplitPane.attrs.indicatorColor);
  }
  set indicatorColor(value) {
    this.setStringAttribute(SplitPane.attrs.indicatorColor, value);
  }

  /**
   * The color of the indicator that appears when hovering or dragging the resizer.
   */
  get indicatorWidth(): SizeName | string | null {
    return this.getStringAttribute(SplitPane.attrs.indicatorWidth);
  }
  set indicatorWidth(value) {
    this.setStringAttribute(SplitPane.attrs.indicatorWidth, value);
  }

  /**
   * Reveal the hidden panel.
   */
  get reveal() {
    return this.getBooleanAttribute(SplitPane.attrs.reveal);
  }
  set reveal(value) {
    this.setBooleanAttribute(SplitPane.attrs.reveal, value);
  }

  /**
   * The hidden panel will be revealed when this event is fired
   */
  get revealEvent(): string | null {
    return this.getStringAttribute(SplitPane.attrs.revealEvent);
  }
  set revealEvent(value) {
    this.setStringAttribute(SplitPane.attrs.revealEvent, value);
  }

  /**
   * The viewport will be unrevealed when this event is fired
   */
  get unrevealEvent(): string | null {
    return this.getStringAttribute(SplitPane.attrs.unrevealEvent);
  }
  set unrevealEvent(value) {
    this.setStringAttribute(SplitPane.attrs.unrevealEvent, value);
  }

  /**
   * The amount to resize the split pane when using keyboard keys to move the divider.
   *
   * Defaults to `32px`
   */
  get step(): string | null {
    return this.getStringAttribute(SplitPane.attrs.step) || "32px";
  }
  set step(value) {
    this.setStringAttribute(SplitPane.attrs.step, value);
  }

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
      this.handlePointerDownResize
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
      this.handlePointerDownResize
    );
    this.refs.resize.removeEventListener(
      "pointerup",
      this.handlePointerUpResize
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
    const step = this.step;
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
