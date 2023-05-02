import SparkleElement from "../../core/sparkle-element";
import { clamp } from "../../utils/clamp";
import { getCssSize } from "../../utils/getCssSize";
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
      "flip",
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
   * Value can be in pixels or a percentage, e.g. `"100px"` or `"50%"`.
   *
   * Defaults to 50% of the container's initial size.
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
  get flip(): boolean {
    return this.getBooleanAttribute("flip");
  }
  set flip(value: boolean) {
    this.setBooleanAttribute("flip", value);
  }

  /**
   * Automatically flip the orientation of the panels when they cannot fit side-by-side.
   */
  get responsive(): boolean {
    return this.getBooleanAttribute("responsive");
  }

  /**
   * If no primary panel is designated, both panels will resize proportionally when the host element is resized. If a
   * primary panel is designated, it will maintain its size and the other panel will grow or shrink as needed when the
   * host element is resized.
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

  /**
   * How close the divider must be to a snap point until snapping occurs.
   *
   * Defaults to `12`.
   * */
  get snapThreshold(): string | null {
    return this.getStringAttribute("snap-threshold");
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

  protected _cachedRootWidth?: number;

  protected _cachedRootHeight?: number;

  protected _cachedSplitX = 0;

  protected _cachedSplitY = 0;

  protected _dragging = false;

  protected _startVertical = false;

  protected _startRtl = false;

  protected _startX: number = 0;

  protected _startY: number = 0;

  protected _startSplitX: number = 0;

  protected _startSplitY: number = 0;

  protected override attributeChangedCallback(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
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
    if (name === "split") {
      if (this._cachedRootWidth != null && this._cachedRootHeight != null) {
        this._cachedSplitX = this.getSplitPixelValue(
          this.split,
          this._cachedRootWidth
        );
        this._cachedSplitY = this.getSplitPixelValue(
          this.split,
          this._cachedRootHeight
        );
        const dividerEl = this.dividerEl;
        if (dividerEl) {
          if (newValue != null) {
            dividerEl.setAttribute("aria-valuenow", newValue);
          } else {
            dividerEl.removeAttribute("aria-valuenow");
          }
        }
        this.updateSplit(newValue);
      }
    }
    if (name === "vertical" || name === "flip") {
      this.updateSplit(this.split);
    }
    if (name === "min-panel-width" || name === "min-panel-height") {
      this.updateSplit(this.split);
    }
    if (name === "divider-width") {
      this.updateRootStyle("--divider-width", newValue);
    }
    if (name === "divider-hit-area") {
      this.updateRootStyle("--divider-hit-area", newValue);
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
    const { width, height } = this.root.getBoundingClientRect();
    this._cachedRootWidth = width;
    this._cachedRootHeight = height;
    this._cachedSplitX = this.getSplitPixelValue(
      this.split,
      this._cachedRootWidth
    );
    this._cachedSplitY = this.getSplitPixelValue(
      this.split,
      this._cachedRootHeight
    );
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
    return (this.flip && !vertical) || (vertical && !this.flip);
  }

  private updateSplit(split: string | null): void {
    if (this._cachedRootWidth != null && this._cachedRootHeight != null) {
      const isVertical = this.isVertical();
      const rootSize = isVertical
        ? this._cachedRootHeight
        : this._cachedRootWidth;
      const sizeMin = isVertical
        ? getCssSize(this.minPanelHeight || "0")
        : getCssSize(this.minPanelWidth || "0");
      const startEl = this.startEl;
      if (startEl && rootSize != null) {
        const splitValue = this.getSplitPixelValue(split, rootSize);
        const splitPercentage = this.pixelsToPercentage(splitValue, rootSize);
        const min = `min(calc(100% - ${sizeMin}), max(${sizeMin}, ${splitPercentage}))`;
        const max = splitPercentage;
        if (isVertical) {
          startEl.style.setProperty("min-height", min);
          startEl.style.setProperty("max-height", max);
          startEl.style.setProperty("min-width", null);
          startEl.style.setProperty("max-width", null);
        } else {
          startEl.style.setProperty("min-width", min);
          startEl.style.setProperty("max-width", max);
          startEl.style.setProperty("min-height", null);
          startEl.style.setProperty("max-height", null);
        }
      }
      this.emit("s-reposition");
    }
  }

  protected getSplitPixelValue(value: string | null, rootSize: number): number {
    return this.getPixelValue(
      value,
      this.percentageToPixelValue(50, rootSize),
      rootSize
    );
  }

  private getPixelValue(
    value: string | null,
    defaultValue: number,
    rootSize: number
  ): number {
    if (!value) {
      return defaultValue;
    }
    value = value?.trim();
    if (value.endsWith("%")) {
      return this.percentageToPixelValue(
        Number(value.replace("%", "")),
        rootSize
      );
    }
    if (value.endsWith("px")) {
      return Number(value.replace("px", ""));
    }
    return Number(value);
  }

  private percentageToPixelValue(
    percentageValue: number,
    rootSize: number
  ): number {
    return rootSize * (percentageValue / 100);
  }

  private formatPercentage(percentageValue: number): string {
    const percentage = clamp(percentageValue, 0, 100);
    return `${percentage}%`;
  }

  private pixelsToPercentage(pixelValue: number, rootSize: number): string {
    const percentageValue = (pixelValue / rootSize) * 100;
    return this.formatPercentage(percentageValue);
  }

  private handlePointerDown = (event: PointerEvent): void => {
    const { width, height } = this.root.getBoundingClientRect();
    this._cachedRootWidth = width;
    this._cachedRootHeight = height;
    this._startVertical = this.isVertical();
    this._startRtl = this.rtl;
    this._startX = event.screenX;
    this._startY = event.screenY;
    this._startSplitX = this.getSplitPixelValue(
      this.split,
      this._cachedRootWidth
    );
    this._startSplitY = this.getSplitPixelValue(
      this.split,
      this._cachedRootHeight
    );
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
    if (this._cachedRootWidth == null || this._cachedRootHeight == null) {
      return;
    }
    if (this.disabled) {
      return;
    }

    // Prevent text selection when dragging
    if (event.cancelable) {
      event.preventDefault();
    }
    const deltaX = event.screenX - this._startX;
    const deltaY = event.screenY - this._startY;

    const startRtl = this._startRtl;
    const startVertical = this._startVertical;

    const startSplit = startVertical ? this._startSplitY : this._startSplitX;
    const rootSize = startVertical
      ? this._cachedRootHeight
      : this._cachedRootWidth;
    const sizeMin = startVertical
      ? getCssSize(this.minPanelHeight || "0")
      : getCssSize(this.minPanelWidth || "0");
    const delta = startVertical ? deltaY : deltaX;

    let newPositionInPixels = startSplit + delta;

    // Flip for end panels
    if (this.primary === "end") {
      newPositionInPixels = rootSize - newPositionInPixels;
    }

    // Check snap points
    const snap = this.snap || "";
    if (snap) {
      const snaps = snap.split(" ");
      const snapThreshold = this.getPixelValue(
        this.snapThreshold,
        12,
        rootSize
      );
      snaps.forEach((value) => {
        let snapPoint: number;

        if (value.endsWith("%")) {
          snapPoint = rootSize * (parseFloat(value) / 100);
        } else {
          snapPoint = parseFloat(value);
        }

        if (startRtl && !startVertical) {
          snapPoint = rootSize - snapPoint;
        }

        if (
          newPositionInPixels >= snapPoint - snapThreshold &&
          newPositionInPixels <= snapPoint + snapThreshold
        ) {
          newPositionInPixels = snapPoint;
        }
      });
    }
    const min = this.getPixelValue(sizeMin, 0, rootSize);
    const splitValue = clamp(newPositionInPixels, min, rootSize - min);
    this.split = this.pixelsToPercentage(splitValue, rootSize);
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
      const { width, height } = this.root.getBoundingClientRect();
      this._cachedRootWidth = width;
      this._cachedRootHeight = height;
      const isVertical = this.isVertical();
      const rootSize = isVertical
        ? this._cachedRootHeight
        : this._cachedRootWidth;

      let newPercentageValue = this.getSplitPixelValue(this.split, rootSize);
      const incr =
        (event.shiftKey ? 10 : 1) * (this.primary === "end" ? -1 : 1);

      event.preventDefault();

      if (
        (event.key === "ArrowLeft" && !isVertical) ||
        (event.key === "ArrowUp" && isVertical)
      ) {
        newPercentageValue -= incr;
      }

      if (
        (event.key === "ArrowRight" && !isVertical) ||
        (event.key === "ArrowDown" && isVertical)
      ) {
        newPercentageValue += incr;
      }

      if (event.key === "Home") {
        newPercentageValue = this.primary === "end" ? 100 : 0;
      }

      if (event.key === "End") {
        newPercentageValue = this.primary === "end" ? 0 : 100;
      }

      const sizeMin = isVertical
        ? getCssSize(this.minPanelHeight || "0")
        : getCssSize(this.minPanelWidth || "0");
      const min = this.getPixelValue(sizeMin, 0, rootSize);
      const splitValue = clamp(
        this.percentageToPixelValue(newPercentageValue, rootSize),
        min,
        rootSize - min
      );
      this.split = this.formatPercentage(splitValue);
    }
  };

  private handleResize = (entries: ResizeObserverEntry[]): void => {
    const entry = entries[0];
    if (entry) {
      const { width, height } = entry.contentRect;
      this._cachedRootWidth = width;
      this._cachedRootHeight = height;
      const initiallyVertical = this.vertical;
      const minPanelSize = initiallyVertical
        ? this.getPixelValue(
            getCssSize(this.minPanelHeight || "0"),
            0,
            this._cachedRootHeight
          )
        : this.getPixelValue(
            getCssSize(this.minPanelWidth || "0"),
            0,
            this._cachedRootWidth
          );
      const currentRootSize = initiallyVertical ? height : width;
      const newFlip = currentRootSize < minPanelSize * 2;
      if (newFlip !== this.flip && this.responsive) {
        this.flip = newFlip;
      }
      if (this.primary) {
        const isVertical = this.isVertical();
        const cachedSplitPosition = isVertical
          ? this._cachedSplitY
          : this._cachedSplitX;
        const rootSize = isVertical ? height : width;
        const sizeMin = isVertical
          ? getCssSize(this.minPanelHeight || "0")
          : getCssSize(this.minPanelWidth || "0");
        const min = this.getPixelValue(sizeMin, 0, rootSize);
        const splitValue = clamp(cachedSplitPosition, min, rootSize - min);
        this.split = this.pixelsToPercentage(splitValue, rootSize);
      }
    }
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "s-split-layout": SplitLayout;
  }
}
