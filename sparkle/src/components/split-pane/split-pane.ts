import getCssColor from "sparkle-style-transformer/utils/getCssColor.js";
import getCssSize from "sparkle-style-transformer/utils/getCssSize.js";
import SparkleElement from "../../core/sparkle-element";
import { Properties } from "../../types/properties";
import { SizeName } from "../../types/sizeName";
import { getAttributeNameMap } from "../../utils/getAttributeNameMap";
import { getKeys } from "../../utils/getKeys";
import { nextAnimationFrame } from "../../utils/nextAnimationFrame";
import css from "./split-pane.css";
import html from "./split-pane.html";

const styles = new CSSStyleSheet();

export const DEFAULT_TRANSFORMERS = {
  "min-panel-width": getCssSize,
  "min-panel-height": getCssSize,
  "resizer-color": getCssColor,
  "resizer-width": getCssSize,
  "divider-color": getCssColor,
  "divider-width": getCssSize,
  "indicator-color": getCssColor,
  "indicator-width": getCssSize,
};

const DEFAULT_ATTRIBUTES = getAttributeNameMap([
  "vertical",
  "responsive",
  "primary",
  ...getKeys(DEFAULT_TRANSFORMERS),
]);

/**
 * Split Panes display two panels side-by-side and allows the user to adjust their size relative to one another.
 */
export default class SplitPane
  extends SparkleElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override tagName = "s-split-pane";

  static override get attributes() {
    return { ...super.attributes, ...DEFAULT_ATTRIBUTES };
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

  override get styles() {
    styles.replaceSync(SplitPane.augmentCss(css));
    return [styles];
  }

  override get transformers() {
    return { ...super.transformers, ...DEFAULT_TRANSFORMERS };
  }

  /**
   * The smallest width that the panels can be.
   */
  get minPanelWidth(): SizeName | string | null {
    return this.getStringAttribute(SplitPane.attributes.minPanelWidth);
  }
  set minPanelWidth(value) {
    this.setStringAttribute(SplitPane.attributes.minPanelWidth, value);
  }

  /**
   * The smallest height that the panels can be.
   */
  get minPanelHeight(): SizeName | string | null {
    return this.getStringAttribute(SplitPane.attributes.minPanelHeight);
  }
  set minPanelHeight(value) {
    this.setStringAttribute(SplitPane.attributes.minPanelHeight, value);
  }

  /**
   * Automatically change pane of panels when they cannot fit side-by-side.
   *
   * Set to `hide`, to hide the non-primary panel, when out of space.
   * Set to `flip`, to flip the orientation of the panels, when out of space.
   * Set to `flip-reverse`, to flip the orientation and order of the panels, when out of space.
   */
  get responsive(): "hide" | "flip" | "flip-reverse" | null {
    return this.getStringAttribute(SplitPane.attributes.responsive);
  }
  set responsive(value) {
    this.setStringAttribute(SplitPane.attributes.responsive, value);
  }

  /**
   * The primary panel.
   */
  get primary(): "start" | "end" | null {
    return this.getStringAttribute(SplitPane.attributes.primary);
  }
  set primary(value) {
    this.setStringAttribute(SplitPane.attributes.primary, value);
  }

  /**
   * Draws the split panel in a vertical orientation with the start and end panels stacked.
   */
  get vertical(): boolean {
    return this.getBooleanAttribute(SplitPane.attributes.vertical);
  }
  set vertical(value) {
    this.setStringAttribute(SplitPane.attributes.vertical, value);
  }

  /**
   * The color of the area in which drag events will be detected.
   */
  get resizerColor(): SizeName | string | null {
    return this.getStringAttribute(SplitPane.attributes.resizerColor);
  }
  set resizerColor(value) {
    this.setStringAttribute(SplitPane.attributes.resizerColor, value);
  }

  /**
   * The width of the area in which drag events will be detected.
   */
  get resizerWidth(): SizeName | string | null {
    return this.getStringAttribute(SplitPane.attributes.resizerWidth);
  }
  set resizerWidth(value) {
    this.setStringAttribute(SplitPane.attributes.resizerWidth, value);
  }

  /**
   * The color of the divider between the two panels.
   */
  get dividerColor(): SizeName | string | null {
    return this.getStringAttribute(SplitPane.attributes.dividerColor);
  }
  set dividerColor(value) {
    this.setStringAttribute(SplitPane.attributes.dividerColor, value);
  }

  /**
   * The width of the divider between the two panels.
   */
  get dividerWidth(): SizeName | string | null {
    return this.getStringAttribute(SplitPane.attributes.dividerWidth);
  }
  set dividerWidth(value) {
    this.setStringAttribute(SplitPane.attributes.dividerWidth, value);
  }

  /**
   * The color of the indicator that appears when hovering or dragging the resizer.
   */
  get indicatorColor(): SizeName | string | null {
    return this.getStringAttribute(SplitPane.attributes.indicatorColor);
  }
  set indicatorColor(value) {
    this.setStringAttribute(SplitPane.attributes.indicatorColor, value);
  }

  /**
   * The color of the indicator that appears when hovering or dragging the resizer.
   */
  get indicatorWidth(): SizeName | string | null {
    return this.getStringAttribute(SplitPane.attributes.indicatorWidth);
  }
  set indicatorWidth(value) {
    this.setStringAttribute(SplitPane.attributes.indicatorWidth, value);
  }

  protected override onConnected(): void {
    this.setup();
  }

  async setup(): Promise<void> {
    await nextAnimationFrame();
    const size = this.vertical ? this.root.offsetHeight : this.root.offsetWidth;
    const initialSize = `${size / 2}px`;
    this.updateRootCssVariable("initial-size", initialSize);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-split-pane": SplitPane;
  }
}
