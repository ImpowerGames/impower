import { getCssProportion } from "../../../../sparkle-transformer/src/utils/getCssProportion";
import { getCssSize } from "../../../../sparkle-transformer/src/utils/getCssSize";
import SparkleElement from "../../core/sparkle-element";
import { Properties } from "../../types/properties";
import { SizeName } from "../../types/sizeName";
import { clamp } from "../../utils/clamp";
import { getAttributeNameMap } from "../../utils/getAttributeNameMap";
import { getUnitlessValue } from "../../utils/getUnitlessValue";
import { percentToPixels } from "../../utils/percentToPixels";
import { pixelsToPercent } from "../../utils/pixelsToPercent";
import { pixelsToPercentage } from "../../utils/pixelsToPercentage";
import css from "./split-layout.css";
import html from "./split-layout.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

const DEFAULT_ATTRIBUTES = getAttributeNameMap([
  "split",
  "min-panel-width",
  "min-panel-height",
  "vertical",
  "flipped",
  "collapsed",
  "solo",
  "collapsible",
  "responsive",
  "primary",
  "snap",
  "snap-threshold",
  "divider-width",
  "divider-hit-size",
]);

/**
 * Split Layouts display two panels side-by-side and allows the user to adjust their size relative to one another.
 */
export default class SplitLayout
  extends SparkleElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override tagName = "s-split-layout";

  static override get attributes() {
    return { ...super.attributes, ...DEFAULT_ATTRIBUTES };
  }

  static override async define(
    tagName?: string,
    dependencies?: Record<string, string>
  ): Promise<CustomElementConstructor> {
    return super.define(tagName, dependencies);
  }

  override get html(): string {
    return html;
  }

  override get styles(): CSSStyleSheet[] {
    return [styles];
  }

  /**
   * The current position of the divider from the primary panel's edge.
   *
   * Value can be in pixels, percentage, or proportion (e.g. `100px` or `50%` or `0.5`).
   *
   * Defaults to `50%` of the container's size.
   */
  get split(): string | null {
    return this.getStringAttribute(SplitLayout.attributes.split);
  }
  set split(value: string | null) {
    this.setStringAttribute(SplitLayout.attributes.split, value);
  }

  /**
   * The smallest width that the panels can be.
   */
  get minPanelWidth(): SizeName | string | null {
    return this.getStringAttribute(SplitLayout.attributes.minPanelWidth);
  }
  set minPanelWidth(value) {
    this.setStringAttribute(SplitLayout.attributes.minPanelWidth, value);
  }

  /**
   * The smallest height that the panels can be.
   */
  get minPanelHeight(): SizeName | string | null {
    return this.getStringAttribute(SplitLayout.attributes.minPanelHeight);
  }
  set minPanelHeight(value) {
    this.setStringAttribute(SplitLayout.attributes.minPanelHeight, value);
  }

  /**
   * Draws the split panel in a vertical orientation with the start and end panels stacked.
   */
  get vertical(): boolean {
    return this.getBooleanAttribute(SplitLayout.attributes.vertical);
  }
  set vertical(value) {
    this.setStringAttribute(SplitLayout.attributes.vertical, value);
  }

  /**
   * Flips the orientation of the panels.
   */
  get flipped(): string | null {
    return this.getStringAttribute(SplitLayout.attributes.flipped);
  }
  set flipped(value: string | null) {
    this.setStringAttribute(SplitLayout.attributes.flipped, value);
  }

  /**
   * Hides the start or end panel.
   */
  get collapsed(): "start" | "end" | null {
    return this.getStringAttribute(SplitLayout.attributes.collapsed);
  }
  set collapsed(value: "start" | "end" | null) {
    this.setStringAttribute(SplitLayout.attributes.collapsed, value);
  }

  /**
   * Hides the start or end panel and the resize divider.
   */
  get solo(): "start" | "end" | null {
    return this.getStringAttribute(SplitLayout.attributes.solo);
  }
  set solo(value: "start" | "end" | null) {
    this.setStringAttribute(SplitLayout.attributes.solo, value);
  }

  /**
   * Hide a panel when dragged the specified percentage past its minimum size.
   *
   * If not provided a value, defaults to `50%`.
   */
  get collapsible(): string | null {
    return this.getStringAttribute(SplitLayout.attributes.collapsible);
  }
  set collapsible(value) {
    this.setStringAttribute(SplitLayout.attributes.collapsible, value);
  }

  /**
   * Automatically change layout of panels when they cannot fit side-by-side.
   *
   * Set to `flip`, to flip the orientation of the panels, when out of space.
   * Set to `flip-reverse`, to flip the orientation and order of the panels, when out of space.
   * Set to `hide`, to hide the non-primary panel, when out of space.
   */
  get responsive(): "flip" | "flip-reverse" | "hide-end" | "hide-start" | null {
    return this.getStringAttribute(SplitLayout.attributes.responsive);
  }
  set responsive(value) {
    this.setStringAttribute(SplitLayout.attributes.responsive, value);
  }

  /**
   * The primary panel.
   */
  get primary(): "start" | "end" | null {
    return this.getStringAttribute(SplitLayout.attributes.primary);
  }
  set primary(value) {
    this.setStringAttribute(SplitLayout.attributes.primary, value);
  }

  /**
   * One or more space-separated values at which the divider should snap.
   * Values can be in pixels or percentages, e.g. `"100px 50%"`.
   */
  get snap(): string | null {
    return this.getStringAttribute(SplitLayout.attributes.snap);
  }
  set snap(value) {
    this.setStringAttribute(SplitLayout.attributes.snap, value);
  }

  /**
   * How close the divider must be to a snap point until snapping occurs.
   *
   * Defaults to `12px`.
   * */
  get snapThreshold(): SizeName | string | null {
    return this.getStringAttribute(SplitLayout.attributes.snapThreshold);
  }
  set snapThreshold(value) {
    this.setStringAttribute(SplitLayout.attributes.snapThreshold, value);
  }

  /**
   * The width of the divider.
   */
  get dividerWidth(): SizeName | string | null {
    return this.getStringAttribute(SplitLayout.attributes.dividerWidth);
  }
  set dividerWidth(value) {
    this.setStringAttribute(SplitLayout.attributes.dividerWidth, value);
  }

  /**
   * The width of the area in which drag events will be detected.
   */
  get dividerHitSize(): SizeName | string | null {
    return this.getStringAttribute(SplitLayout.attributes.dividerHitSize);
  }
  set dividerHitSize(value) {
    this.setStringAttribute(SplitLayout.attributes.dividerHitSize, value);
  }

  get dividerEl(): HTMLElement | null {
    return this.getElementByClass("divider");
  }

  get startPanelEl(): HTMLElement | null {
    return this.getElementByClass("start-panel");
  }

  get endPanelEl(): HTMLElement | null {
    return this.getElementByClass("end-panel");
  }

  get startSlot(): HTMLSlotElement | null {
    return this.getElementByClass("start");
  }

  get endSlot(): HTMLSlotElement | null {
    return this.getElementByClass("end");
  }

  protected _resizeObserver?: ResizeObserver;

  protected _cachedMinPanelWidth = 0;

  protected _cachedMinPanelHeight = 0;

  protected _cachedSnaps: string[] = [];

  protected _cachedSnapThreshold = 0;

  protected _startVertical = false;

  protected _startReversed = false;

  protected _startCollapsible: string | null = null;

  protected _startRtl = false;

  protected _startRootWidth = 0;

  protected _startRootHeight = 0;

  protected _startScreenX: number = 0;

  protected _startScreenY: number = 0;

  protected _startSplitX: number = 0;

  protected _startSplitY: number = 0;

  protected override onAttributeChanged(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    if (name === SplitLayout.attributes.disabled) {
      const dividerEl = this.dividerEl;
      if (dividerEl) {
        if (newValue != null) {
          dividerEl.removeAttribute("tab-index");
        } else {
          dividerEl.setAttribute("tab-index", "0");
        }
      }
    }
    if (
      name === SplitLayout.attributes.collapsed ||
      name === SplitLayout.attributes.solo
    ) {
      const startEl = this.startPanelEl;
      if (startEl) {
        startEl.hidden = this.collapsed === "start" || this.solo === "end";
      }
      const endEl = this.endPanelEl;
      if (endEl) {
        endEl.hidden = this.collapsed === "end" || this.solo === "start";
      }
      const dividerEl = this.dividerEl;
      if (dividerEl) {
        dividerEl.hidden = this.solo != null;
      }
    }
    if (name === SplitLayout.attributes.split) {
      const dividerEl = this.dividerEl;
      if (dividerEl) {
        if (newValue != null) {
          dividerEl.setAttribute(SplitLayout.attributes.ariaValueNow, newValue);
        } else {
          dividerEl.removeAttribute(SplitLayout.attributes.ariaValueNow);
        }
      }
      this.updateRootCssVariable(name, newValue);
    }
    if (name === SplitLayout.attributes.minPanelWidth) {
      const size = getCssSize(newValue, "px");
      this.updateRootCssVariable(name, size);
      this._cachedMinPanelWidth = getUnitlessValue(size, 0);
    }
    if (name === SplitLayout.attributes.minPanelHeight) {
      const size = getCssSize(newValue, "px");
      this.updateRootCssVariable(name, size);
      this._cachedMinPanelHeight = getUnitlessValue(size, 0);
    }
    if (name === SplitLayout.attributes.snap) {
      this._cachedSnaps = this.snap?.split(" ") || [];
    }
    if (name === SplitLayout.attributes.snapThreshold) {
      const size = getCssSize(newValue, "px");
      this._cachedSnapThreshold = getUnitlessValue(size, 12);
    }
    if (name === SplitLayout.attributes.dividerWidth) {
      this.updateRootCssVariable(name, getCssSize(newValue));
    }
    if (name === SplitLayout.attributes.dividerHitSize) {
      this.updateRootCssVariable(name, getCssSize(newValue));
    }
  }

  protected override onConnected(): void {
    this._resizeObserver = new ResizeObserver(this.handleResize);
    const dividerEl = this.dividerEl;
    dividerEl?.addEventListener("keydown", this.handleKeyDownDivider);
    dividerEl?.addEventListener("pointerdown", this.handlePointerDownDivider);
    dividerEl?.addEventListener("pointermove", this.handlePointerMoveDivider);
  }

  protected override onParsed(): void {
    this._resizeObserver?.observe(this.root);
  }

  protected override onDisconnected(): void {
    this._resizeObserver?.disconnect();
    const dividerEl = this.dividerEl;
    dividerEl?.removeEventListener("keydown", this.handleKeyDownDivider);
    dividerEl?.removeEventListener(
      "pointerdown",
      this.handlePointerDownDivider
    );
    dividerEl?.removeEventListener(
      "pointermove",
      this.handlePointerMoveDivider
    );
  }

  protected isVertical(): boolean {
    const vertical = this.vertical;
    const flip = this.flipped;
    const isFlipped = flip === "flip" || flip === "flip-reverse";
    return (isFlipped && !vertical) || (vertical && !isFlipped);
  }

  protected isReversed(): boolean {
    return this.primary === "end" || this.flipped === "flip-reverse";
  }

  protected getSplitPixelValue(value: string | null, rootSize: number): number {
    if (!value) {
      return percentToPixels(50, rootSize);
    }
    const v = value?.trim();
    if (v.endsWith("%")) {
      return percentToPixels(Number(v.slice(0, -1)), rootSize);
    }
    if (v.endsWith("px")) {
      return Number(v.slice(0, -2));
    }
    return Number(v) * rootSize;
  }

  private handlePointerDownDivider = (e: PointerEvent): void => {
    const el = e.currentTarget as HTMLElement;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    const { width, height } = this.root.getBoundingClientRect();
    this._startRootWidth = width;
    this._startRootHeight = height;
    this._startVertical = this.isVertical();
    this._startReversed = this.isReversed();
    this._startCollapsible = this.collapsible;
    this._startRtl = this.rtl;
    this._startScreenX = e.screenX;
    this._startScreenY = e.screenY;
    const split = this.split;
    const splitX = this.getSplitPixelValue(split, width);
    const splitY = this.getSplitPixelValue(split, height);
    this._startSplitX = this._startReversed ? width - splitX : splitX;
    this._startSplitY = this._startReversed ? height - splitY : splitY;
  };

  private handlePointerMoveDivider = (e: PointerEvent): void => {
    const el = e.currentTarget as HTMLElement;
    if (!el.hasPointerCapture(e.pointerId)) {
      return;
    }
    if (this.disabled) {
      return;
    }

    const minPanelWidth = this._cachedMinPanelWidth;
    const minPanelHeight = this._cachedMinPanelHeight;
    const snaps = this._cachedSnaps;
    const snapThreshold = this._cachedSnapThreshold;
    const isRtl = this._startRtl;
    const isVertical = this._startVertical;
    const isReversed = this._startReversed;
    const isCollapsible = this._startCollapsible;
    const rootWidth = this._startRootWidth;
    const rootHeight = this._startRootHeight;
    const splitX = this._startSplitX;
    const splitY = this._startSplitY;
    const startScreenX = this._startScreenX;
    const startScreenY = this._startScreenY;

    // Prevent text selection when dragging
    if (e.cancelable) {
      e.preventDefault();
    }
    const deltaX = e.screenX - startScreenX;
    const deltaY = e.screenY - startScreenY;

    const startSplit = isVertical ? splitY : splitX;
    const rootSize = isVertical ? rootHeight : rootWidth;
    const min = isVertical ? minPanelHeight : minPanelWidth;
    const max = rootSize - min;
    const delta = isVertical ? deltaY : deltaX;

    let newPositionInPixels = startSplit + delta;

    // Flip for end panels
    if (isReversed) {
      newPositionInPixels = rootSize - newPositionInPixels;
    }

    // Check snap points
    snaps.forEach((value) => {
      let snapPoint: number;

      if (value.endsWith("%")) {
        snapPoint = rootSize * (parseFloat(value) / 100);
      } else {
        snapPoint = parseFloat(value);
      }

      if (isRtl && !isVertical) {
        snapPoint = rootSize - snapPoint;
      }

      if (
        newPositionInPixels >= snapPoint - snapThreshold &&
        newPositionInPixels <= snapPoint + snapThreshold
      ) {
        newPositionInPixels = snapPoint;
      }
    });

    if (isCollapsible != null) {
      const collapseThreshold = getCssProportion(isCollapsible, 0.5);
      if (newPositionInPixels <= min * collapseThreshold) {
        this.collapsed = "start";
        newPositionInPixels = 0;
      } else if (newPositionInPixels >= max + min * (1 - collapseThreshold)) {
        this.collapsed = "end";
        newPositionInPixels = rootSize;
      } else {
        this.collapsed = null;
      }
    }

    this.split = pixelsToPercentage(
      this.collapsed
        ? newPositionInPixels
        : clamp(newPositionInPixels, min, max),
      rootSize
    );
  };

  private handleKeyDownDivider = (e: KeyboardEvent): void => {
    if (this.disabled) {
      return;
    }

    if (
      [
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
      ].includes(e.key)
    ) {
      const minPanelWidth = this._cachedMinPanelWidth;
      const minPanelHeight = this._cachedMinPanelHeight;

      const { width, height } = this.root.getBoundingClientRect();
      const isVertical = this.isVertical();
      const isReversed = this.isReversed();
      const rootSize = isVertical ? height : width;

      const split = this.split;
      const positionInPixels = this.getSplitPixelValue(split, rootSize);
      let newPercent = pixelsToPercent(positionInPixels, rootSize);
      const incr = (e.shiftKey ? 10 : 1) * (isReversed ? -1 : 1);

      e.preventDefault();

      if (
        (e.key === "ArrowLeft" && !isVertical) ||
        (e.key === "ArrowUp" && isVertical)
      ) {
        newPercent -= incr;
      }

      if (
        (e.key === "ArrowRight" && !isVertical) ||
        (e.key === "ArrowDown" && isVertical)
      ) {
        newPercent += incr;
      }

      if (e.key === "Home") {
        newPercent = isReversed ? 100 : 0;
      }

      if (e.key === "End") {
        newPercent = isReversed ? 0 : 100;
      }

      const min = isVertical ? minPanelHeight : minPanelWidth;
      const splitValue = clamp(
        percentToPixels(newPercent, rootSize),
        min,
        rootSize - min
      );
      this.split = pixelsToPercentage(splitValue, rootSize);
    }
  };

  private handleResize = (entries: ResizeObserverEntry[]): void => {
    const entry = entries[0];
    if (entry) {
      const { width, height } = entry.contentRect;
      const verticalByDefault = this.vertical;
      const responsive = this.responsive;
      const minPanelSize = verticalByDefault
        ? this._cachedMinPanelHeight
        : this._cachedMinPanelWidth;
      const currentRootSize = verticalByDefault ? height : width;
      const belowBreakpoint = currentRootSize < minPanelSize * 2;
      if (responsive === "flip" || responsive === "flip-reverse") {
        const newFlipped = belowBreakpoint ? responsive : null;
        if (this.flipped !== newFlipped) {
          this.flipped = newFlipped;
        }
      } else if (responsive === "hide-end" || responsive === "hide-start") {
        const soloTarget = responsive === "hide-start" ? "end" : "start";
        const newSolo = belowBreakpoint ? soloTarget : null;
        if (this.solo !== newSolo) {
          this.solo = newSolo;
        }
      }
    }
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "s-split-layout": SplitLayout;
  }
}
