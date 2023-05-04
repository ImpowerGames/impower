import SparkleElement from "../../core/sparkle-element";
import { clamp } from "../../utils/clamp";
import { getCssProportion } from "../../utils/getCssProportion";
import { getCssSize } from "../../utils/getCssSize";
import { getUnitlessValue } from "../../utils/getUnitlessValue";
import { percentToPercentage } from "../../utils/percentToPercentage";
import { percentToPixels } from "../../utils/percentToPixels";
import { pixelsToPercent } from "../../utils/pixelsToPercent";
import { pixelsToPercentage } from "../../utils/pixelsToPercentage";
import css from "./split-layout.css";
import html from "./split-layout.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

/**
 * Split Layouts display two panels side-by-side and allows the user to adjust their size relative to one another.
 */
export default class SplitLayout extends SparkleElement {
  static override async define(
    tag = "s-split-layout",
    dependencies?: Record<string, string>
  ): Promise<CustomElementConstructor> {
    return super.define(tag, dependencies);
  }

  override get html(): string {
    return html;
  }

  override get styles(): CSSStyleSheet[] {
    return [styles];
  }

  static override get observedAttributes() {
    return [
      ...super.observedAttributes,
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
      "divider-hit-area",
    ];
  }

  /**
   * The current position of the divider from the primary panel's edge.
   *
   * Value can be in pixels, percentage, or proportion (e.g. `100px` or `50%` or `0.5`).
   *
   * Defaults to `50%` of the container's size.
   */
  get split(): string | null {
    return this.getStringAttribute("split");
  }
  set split(value: string | null) {
    this.setStringAttribute("split", value);
  }

  /**
   * The smallest width that the panels can be.
   */
  get minPanelWidth(): string | null {
    return this.getStringAttribute("min-panel-width");
  }

  /**
   * The smallest height that the panels can be.
   */
  get minPanelHeight(): string | null {
    return this.getStringAttribute("min-panel-height");
  }

  /**
   * Draws the split panel in a vertical orientation with the start and end panels stacked.
   */
  get vertical(): boolean {
    return this.getBooleanAttribute("vertical");
  }

  /**
   * Flips the orientation of the panels.
   */
  get flipped(): string | null {
    return this.getStringAttribute("flipped");
  }
  set flipped(value: string | null) {
    this.setStringAttribute("flipped", value);
  }

  /**
   * Hides the start or end panel.
   */
  get collapsed(): "start" | "end" | null {
    return this.getStringAttribute("collapsed");
  }
  set collapsed(value: "start" | "end" | null) {
    this.setStringAttribute("collapsed", value);
  }

  /**
   * Hides the start or end panel and the resize divider.
   */
  get solo(): "start" | "end" | null {
    return this.getStringAttribute("solo");
  }
  set solo(value: "start" | "end" | null) {
    this.setStringAttribute("solo", value);
  }

  /**
   * Hide a panel when dragged the specified percentage past its minimum size.
   *
   * If not provided a value, defaults to `50%`.
   */
  get collapsible(): string | null {
    return this.getStringAttribute("collapsible");
  }

  /**
   * Automatically change layout of panels when they cannot fit side-by-side.
   *
   * Set to `flip`, to flip the orientation of the panels, when out of space.
   * Set to `flip-reverse`, to flip the orientation and order of the panels, when out of space.
   * Set to `hide`, to hide the non-primary panel, when out of space.
   */
  get responsive(): "flip" | "flip-reverse" | "hide-end" | "hide-start" | null {
    return this.getStringAttribute("responsive");
  }

  /**
   * The primary panel.
   */
  get primary(): "start" | "end" | null {
    return this.getStringAttribute("primary");
  }

  /**
   * One or more space-separated values at which the divider should snap.
   * Values can be in pixels or percentages, e.g. `"100px 50%"`.
   */
  get snap(): string | null {
    return this.getStringAttribute("snap");
  }

  /**
   * How close the divider must be to a snap point until snapping occurs.
   *
   * Defaults to `12`.
   * */
  get snapThreshold(): string | null {
    return this.getStringAttribute("snap-threshold");
  }

  /**
   * The width of the divider.
   */
  get dividerWidth(): string | null {
    return this.getStringAttribute("divider-width");
  }

  /**
   * The width of the area in which drag events will be detected.
   */
  get dividerHitArea(): string | null {
    return this.getStringAttribute("divider-hit-area");
  }

  get dividerEl(): HTMLElement | null {
    return this.getElementByClass("divider");
  }

  get startEl(): HTMLElement | null {
    return this.getElementByClass("start");
  }

  get endEl(): HTMLElement | null {
    return this.getElementByClass("end");
  }

  protected _resizeObserver?: ResizeObserver;

  protected _cachedMinPanelWidth = 0;

  protected _cachedMinPanelHeight = 0;

  protected _cachedSnaps: string[] = [];

  protected _cachedSnapThreshold = 0;

  protected _dragging = false;

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

  protected override attributeChangedCallback(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (name === "disabled") {
      const dividerEl = this.dividerEl;
      if (dividerEl) {
        if (newValue != null) {
          dividerEl.removeAttribute("tab-index");
        } else {
          dividerEl.setAttribute("tab-index", "0");
        }
      }
    }
    if (name === "collapsed") {
      const startEl = this.startEl;
      if (startEl) {
        startEl.hidden = newValue === "start";
      }
      const endEl = this.endEl;
      if (endEl) {
        endEl.hidden = newValue === "end";
      }
    }
    if (name === "split") {
      const dividerEl = this.dividerEl;
      if (dividerEl) {
        if (newValue != null) {
          dividerEl.setAttribute("aria-valuenow", newValue);
        } else {
          dividerEl.removeAttribute("aria-valuenow");
        }
      }
      this.updateRootCssVariable(name, newValue);
    }
    if (name === "min-panel-width") {
      const size = getCssSize(newValue);
      this.updateRootCssVariable(name, size);
      this._cachedMinPanelWidth = getUnitlessValue(size, 0);
    }
    if (name === "min-panel-height") {
      const size = getCssSize(newValue);
      this.updateRootCssVariable(name, size);
      this._cachedMinPanelHeight = getUnitlessValue(size, 0);
    }
    if (name === "snap") {
      this._cachedSnaps = this.snap?.split(" ") || [];
    }
    if (name === "snap-threshold") {
      this._cachedSnapThreshold = getUnitlessValue(this.snapThreshold, 12);
    }
    if (name === "divider-width") {
      this.updateRootCssVariable(name, getCssSize(newValue));
    }
    if (name === "divider-hit-area") {
      this.updateRootCssVariable(name, getCssSize(newValue));
    }
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this._resizeObserver = new ResizeObserver(this.handleResize);
    const dividerEl = this.dividerEl;
    dividerEl?.addEventListener("keydown", this.handleKeyDown);
    dividerEl?.addEventListener("pointerdown", this.handlePointerDown);
    window?.addEventListener("pointermove", this.handlePointerMove);
    window?.addEventListener("pointerup", this.handlePointerUp);
  }

  override parsedCallback(): void {
    super.parsedCallback();
    this._resizeObserver?.observe(this.root);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._resizeObserver?.disconnect();
    const dividerEl = this.dividerEl;
    dividerEl?.removeEventListener("keydown", this.handleKeyDown);
    dividerEl?.removeEventListener("pointerdown", this.handlePointerDown);
    window?.removeEventListener("pointermove", this.handlePointerMove);
    window?.removeEventListener("pointerup", this.handlePointerUp);
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

  private handlePointerDown = (event: PointerEvent): void => {
    const { width, height } = this.root.getBoundingClientRect();
    this._startRootWidth = width;
    this._startRootHeight = height;
    this._startVertical = this.isVertical();
    this._startReversed = this.isReversed();
    this._startCollapsible = this.collapsible;
    this._startRtl = this.rtl;
    this._startScreenX = event.screenX;
    this._startScreenY = event.screenY;
    const split = this.split;
    const splitX = this.getSplitPixelValue(split, width);
    const splitY = this.getSplitPixelValue(split, height);
    this._startSplitX = this._startReversed ? width - splitX : splitX;
    this._startSplitY = this._startReversed ? height - splitY : splitY;
    this._dragging = true;
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (!this._dragging) {
      return;
    }
    if (event.pressure === 0) {
      this._dragging = false;
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
    if (event.cancelable) {
      event.preventDefault();
    }
    const deltaX = event.screenX - startScreenX;
    const deltaY = event.screenY - startScreenY;

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

  private handlePointerUp = (): void => {
    this._dragging = false;
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
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
      ].includes(event.key)
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
      const incr = (event.shiftKey ? 10 : 1) * (isReversed ? -1 : 1);

      event.preventDefault();

      if (
        (event.key === "ArrowLeft" && !isVertical) ||
        (event.key === "ArrowUp" && isVertical)
      ) {
        newPercent -= incr;
      }

      if (
        (event.key === "ArrowRight" && !isVertical) ||
        (event.key === "ArrowDown" && isVertical)
      ) {
        newPercent += incr;
      }

      if (event.key === "Home") {
        newPercent = isReversed ? 100 : 0;
      }

      if (event.key === "End") {
        newPercent = isReversed ? 0 : 100;
      }

      const min = isVertical ? minPanelHeight : minPanelWidth;
      const splitValue = clamp(
        percentToPixels(newPercent, rootSize),
        min,
        rootSize - min
      );
      this.split = percentToPercentage(splitValue);
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
