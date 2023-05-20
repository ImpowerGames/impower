import {
  computePosition,
  flip,
  offset,
  platform,
  shift,
  size,
} from "@floating-ui/dom";
import type SparkleEvent from "../../core/SparkleEvent";
import SparkleElement from "../../core/sparkle-element";
import { Properties } from "../../types/properties";
import { getAttributeNameMap } from "../../utils/getAttributeNameMap";
import { offsetParent } from "./composed-offset-position";
import css from "./popup.css";
import html from "./popup.html";

const styles = new CSSStyleSheet();

const REPOSITION_EVENT = "reposition";

const DEFAULT_ATTRIBUTES = getAttributeNameMap([
  "open",
  "anchor",
  "placement",
  "strategy",
  "distance",
  "skidding",
  "arrow",
  "arrow-placement",
  "arrow-padding",
  "disable-auto-flip",
  "flip-fallback-placements",
  "flip-fallback-strategy",
  "flip-boundary",
  "flip-padding",
  "disable-auto-shift",
  "shift-boundary",
  "shift-padding",
  "auto-size",
  "sync",
  "auto-size-boundary",
  "auto-size-padding",
]);

/**
 * Popup is a utility that lets you declaratively anchor "popup" containers to another element.
 */
export default class Popup
  extends SparkleElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override tagName = "s-popup";

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
    styles.replaceSync(Popup.augmentCss(css));
    return [styles];
  }

  /**
   * The element the popup will be anchored to. If the anchor lives outside of the popup, you can provide its `id` or a
   * reference to it here. If the anchor lives inside the popup, use the `anchor` slot instead.
   */
  get anchor(): string | null {
    return this.getStringAttribute(Popup.attributes.anchor);
  }
  set anchor(value) {
    this.setStringAttribute(Popup.attributes.anchor, value);
  }

  /**
   * Activates the positioning logic and shows the popup. When this attribute is removed, the positioning logic is torn
   * down and the popup will be hidden.
   */
  get open(): boolean {
    return this.getBooleanAttribute(Popup.attributes.open);
  }
  set open(value: boolean) {
    this.setBooleanAttribute(Popup.attributes.open, value);
  }

  /**
   * The preferred placement of the popup. Note that the actual placement will vary as configured to keep the
   * panel inside of the viewport.
   */
  get placement():
    | "top"
    | "top-start"
    | "top-end"
    | "bottom"
    | "bottom-start"
    | "bottom-end"
    | "right"
    | "right-start"
    | "right-end"
    | "left"
    | "left-start"
    | "left-end" {
    return this.getStringAttribute(Popup.attributes.placement) || "top";
  }
  set placement(value) {
    this.setStringAttribute(Popup.attributes.placement, value);
  }

  /**
   * Determines how the popup is positioned. The `absolute` strategy works well in most cases, but if overflow is
   * clipped, using a `fixed` position strategy can often workaround it.
   */
  get strategy(): "absolute" | "fixed" {
    return this.getStringAttribute(Popup.attributes.strategy) || "absolute";
  }
  set strategy(value) {
    this.setStringAttribute(Popup.attributes.strategy, value);
  }

  /**
   * The distance in pixels from which to offset the panel away from its anchor.
   */
  get distance(): number | null {
    return this.getNumberAttribute(Popup.attributes.distance) ?? 8;
  }
  set distance(value) {
    this.setStringAttribute(Popup.attributes.distance, value);
  }

  /**
   * The distance in pixels from which to offset the panel along its anchor.
   */
  get skidding(): number | null {
    return this.getNumberAttribute(Popup.attributes.skidding);
  }
  set skidding(value) {
    this.setStringAttribute(Popup.attributes.skidding, value);
  }

  /**
   * Attaches an arrow to the popup. The arrow's size and color can be customized using the `--arrow-size` and
   * `--arrow-color` custom properties. For additional customizations, you can also target the arrow using
   * `::part(arrow)` in your stylesheet.
   */
  get arrow(): boolean {
    return this.getBooleanAttribute(Popup.attributes.arrow);
  }
  set arrow(value) {
    this.setStringAttribute(Popup.attributes.arrow, value);
  }

  /**
   * The placement of the arrow. The default is `anchor`, which will align the arrow as close to the center of the
   * anchor as possible, considering available space and `arrow-padding`. A value of `start`, `end`, or `center` will
   * align the arrow to the start, end, or center of the popover instead.
   */
  get arrowPlacement(): "anchor" | "start" | "end" | "center" | null {
    return this.getStringAttribute(Popup.attributes.arrowPlacement);
  }
  set arrowPlacement(value) {
    this.setStringAttribute(Popup.attributes.arrowPlacement, value);
  }

  /**
   * The amount of padding between the arrow and the edges of the popup. If the popup has a border-radius, for example,
   * this will prevent it from overflowing the corners.
   */
  get arrowPadding(): number | null {
    return this.getNumberAttribute(Popup.attributes.arrowPadding);
  }
  set arrowPadding(value) {
    this.setStringAttribute(Popup.attributes.arrowPadding, value);
  }

  /**
   * By default, when the popup's position will cause it to be clipped,
   * it will automatically flip to the opposite site to keep it in view.
   * This disables that behavior.
   * You can use `flipFallbackPlacements` to further configure how the fallback placement is determined.
   */
  get disableAutoFlip(): boolean {
    return this.getBooleanAttribute(Popup.attributes.disableAutoFlip);
  }
  set disableAutoFlip(value) {
    this.setStringAttribute(Popup.attributes.disableAutoFlip, value);
  }

  /**
   * If the preferred placement doesn't fit, popup will be tested in these fallback placements until one fits. Must be a
   * string of any number of placements separated by a space, e.g. "top bottom left". If no placement fits, the flip
   * fallback strategy will be used instead.
   * */
  get flipFallbackPlacements(): string | null {
    return this.getStringAttribute(Popup.attributes.flipFallbackPlacements);
  }
  set flipFallbackPlacements(value) {
    this.setStringAttribute(Popup.attributes.flipFallbackPlacements, value);
  }

  /**
   * When neither the preferred placement nor the fallback placements fit, this value will be used to determine whether
   * the popup should be positioned using the best available fit based on available space or as it was initially
   * preferred.
   */
  get flipFallbackStrategy(): "best-fit" | "initial" | null {
    return this.getStringAttribute(Popup.attributes.flipFallbackStrategy);
  }
  set flipFallbackStrategy(value) {
    this.setStringAttribute(Popup.attributes.flipFallbackStrategy, value);
  }

  /**
   * The id of the clipping element(s) that overflow will be checked relative to when flipping. By
   * default, the boundary includes overflow ancestors that will cause the element to be clipped. If needed, you can
   * change the boundary by passing a reference to one or more elements to this property.
   */
  get flipBoundary(): string | null {
    return this.getStringAttribute(Popup.attributes.flipBoundary);
  }
  set flipBoundary(value) {
    this.setStringAttribute(Popup.attributes.flipBoundary, value);
  }

  /**
   * The amount of padding, in pixels, to exceed before the flip behavior will occur.
   */
  get flipPadding(): number | null {
    return this.getNumberAttribute(Popup.attributes.flipPadding);
  }
  set flipPadding(value) {
    this.setStringAttribute(Popup.attributes.flipPadding, value);
  }

  /**
   * By default, the when the popup's position will cause it to be clipped,
   * the popup will automatically reposition itself along the axis to keep it in view.
   * This disables that behavior.
   */
  get disableAutoShift(): boolean {
    return this.getBooleanAttribute(Popup.attributes.disableAutoShift);
  }
  set disableAutoShift(value) {
    this.setStringAttribute(Popup.attributes.disableAutoShift, value);
  }

  /**
   * The id of the clipping element(s) that overflow will be checked relative to when shifting. By
   * default, the boundary includes overflow ancestors that will cause the element to be clipped. If needed, you can
   * change the boundary by passing a reference to one or more elements to this property.
   */
  get shiftBoundary(): string | null {
    return this.getStringAttribute(Popup.attributes.shiftBoundary);
  }
  set shiftBoundary(value) {
    this.setStringAttribute(Popup.attributes.shiftBoundary, value);
  }

  /**
   * The amount of padding, in pixels, to exceed before the shift behavior will occur.
   */
  get shiftPadding(): number | null {
    return this.getNumberAttribute(Popup.attributes.shiftPadding);
  }
  set shiftPadding(value) {
    this.setStringAttribute(Popup.attributes.shiftPadding, value);
  }

  /**
   * When set, this will cause the popup to automatically resize itself to prevent it from overflowing.
   */
  get autoSize(): "horizontal" | "vertical" | "both" | null {
    return this.getStringAttribute(Popup.attributes.autoSize);
  }
  set autoSize(value) {
    this.setStringAttribute(Popup.attributes.autoSize, value);
  }

  /**
   * Syncs the popup's width or height to that of the anchor element.
   */
  get sync(): "width" | "height" | "both" | null {
    return this.getStringAttribute(Popup.attributes.sync);
  }
  set sync(value) {
    this.setStringAttribute(Popup.attributes.sync, value);
  }

  /**
   * The id of the clipping element(s) that overflow will be checked relative to when resizing. By
   * default, the boundary includes overflow ancestors that will cause the element to be clipped. If needed, you can
   * change the boundary by passing a reference to one or more elements to this property.
   */
  get autoSizeBoundary(): string | null {
    return this.getStringAttribute(Popup.attributes.autoSizeBoundary);
  }
  set autoSizeBoundary(value) {
    this.setStringAttribute(Popup.attributes.autoSizeBoundary, value);
  }

  /**
   * The amount of padding, in pixels, to exceed before the auto-size behavior will occur.
   */
  get autoSizePadding(): number | null {
    return this.getNumberAttribute(Popup.attributes.autoSizePadding);
  }
  set autoSizePadding(value) {
    this.setStringAttribute(Popup.attributes.autoSizePadding, value);
  }

  get anchorEl(): HTMLElement | null {
    let el: HTMLElement | null = null;
    if (this.anchor && typeof this.anchor === "string") {
      // Locate the anchor by id
      const root = this.getRootNode() as Document | ShadowRoot;
      el = root.getElementById(this.anchor);
    } else {
      // Look for a slotted anchor
      if (this.shadowRoot) {
        el = this.contentSlot?.assignedElements()?.[0] as HTMLElement;
      } else {
        el = Array.from(this.contentSlot?.children || [])?.[0] as HTMLElement;
      }
    }
    // An element with `display: contents` cannot be used for calculating position,
    // so use the firstElementChild of the anchor instead
    if (el && window.getComputedStyle(el).display === "contents") {
      el = (el.shadowRoot || el)?.firstElementChild as HTMLElement;
    }
    return el;
  }

  get popupEl(): HTMLElement | null {
    return this.getElementByClass("popup");
  }

  get popupSlot(): HTMLSlotElement | null {
    return this.getElementByClass("popup-slot");
  }

  protected _intersectionObserver?: IntersectionObserver;

  protected override onAttributeChanged(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    if (name === Popup.attributes.strategy) {
      const fixed = newValue === "fixed";
      if (fixed) {
        this.popupEl?.classList.add("fixed");
      } else {
        this.popupEl?.classList.remove("fixed");
      }
    }

    // Update the anchorEl when anchor changes
    if (name === Popup.attributes.anchor) {
      this.setupAnchor();
    }

    // All other properties will trigger a reposition when active
    window.setTimeout(() => {
      this.reposition();
    });
  }

  protected override onConnected(): void {}

  protected override onParsed(): void {
    this.start();
  }

  protected override onDisconnected(): void {
    this._intersectionObserver?.disconnect();
    this.stop();
  }

  getElementById(id: string | null): HTMLElement | undefined {
    const root = this.getRootNode() as Document | ShadowRoot;
    return id ? root.getElementById(id) || undefined : undefined;
  }

  override onContentAssigned() {
    this.setupAnchor();
  }

  async setupAnchor() {
    await this.stop();
    await this.start();
  }

  protected async start() {
    const anchorEl = this.anchorEl;
    const popupEl = this.popupEl;

    if (!anchorEl) {
      // We can't start the positioner without an anchor
      throw new Error(
        "Invalid anchor element: no anchor could be found using the anchor slot or the anchor attribute."
      );
    }
    if (!popupEl) {
      return;
    }

    if (!this._intersectionObserver) {
      this._intersectionObserver = new IntersectionObserver(this.update);
      this._intersectionObserver?.observe(anchorEl);
    }
    this.reposition();
  }

  protected async stop() {
    this.removeAttribute("data-current-placement");
    this.updateRootCssVariable("--auto-size-available-width", null);
    this.updateRootCssVariable("--auto-size-available-height", null);
  }

  update = (): void => {
    this.reposition();
  };

  /** Forces the popup to recalculate and reposition itself. */
  reposition() {
    const anchorEl = this.anchorEl;
    const popupEl = this.popupEl;
    // Nothing to do if the popup or anchor doesn't exist
    if (!anchorEl || !popupEl) {
      return;
    }

    //
    // NOTE: Floating UI middlewares are order dependent: https://floating-ui.com/docs/middleware
    //
    const middleware = [
      // The offset middleware goes first
      offset({ mainAxis: this.distance || 0, crossAxis: this.skidding || 0 }),
    ];

    // First we sync width/height
    if (this.sync) {
      middleware.push(
        size({
          apply: (args: {
            rects: { reference: { width: number; height: number } };
          }) => {
            const { rects } = args;
            const syncWidth = this.sync === "width" || this.sync === "both";
            const syncHeight = this.sync === "height" || this.sync === "both";
            popupEl.style.width = syncWidth ? `${rects.reference.width}px` : "";
            popupEl.style.height = syncHeight
              ? `${rects.reference.height}px`
              : "";
          },
        })
      );
    } else {
      // Cleanup styles if we're not matching width/height
      popupEl.style.width = "";
      popupEl.style.height = "";
    }

    // Then we flip
    if (!this.disableAutoFlip) {
      middleware.push(
        flip({
          boundary: this.getElementById(this.flipBoundary),
          // @ts-expect-error - We're converting a string attribute to an array here
          fallbackPlacements: this.flipFallbackPlacements,
          fallbackStrategy:
            this.flipFallbackStrategy === "best-fit"
              ? "bestFit"
              : "initialPlacement",
          padding: this.flipPadding || 0,
        })
      );
    }

    // Then we shift
    if (!this.disableAutoShift) {
      middleware.push(
        shift({
          boundary: this.getElementById(this.shiftBoundary),
          padding: this.shiftPadding || 0,
        })
      );
    }

    // Now we adjust the size as needed
    if (this.autoSize) {
      middleware.push(
        size({
          boundary: this.getElementById(this.autoSizeBoundary),
          padding: this.autoSizePadding || 0,
          apply: (args: {
            availableWidth: number;
            availableHeight: number;
          }) => {
            const { availableWidth, availableHeight } = args;
            const autoSizeAvailableHeight =
              this.autoSize === "vertical" || this.autoSize === "both"
                ? `${availableHeight}px`
                : null;
            const autoSizeAvailableWidth =
              this.autoSize === "horizontal" || this.autoSize === "both"
                ? `${availableWidth}px`
                : null;
            this.updateRootCssVariable(
              "--auto-size-available-height",
              autoSizeAvailableHeight
            );
            this.updateRootCssVariable(
              "--auto-size-available-width",
              autoSizeAvailableWidth
            );
          },
        })
      );
    } else {
      // Cleanup styles if we're no longer using auto-size
      this.updateRootCssVariable("--auto-size-available-height", null);
      this.updateRootCssVariable("--auto-size-available-width", null);
    }

    //
    // Use custom positioning logic if the strategy is absolute. Otherwise, fall back to the default logic.
    //
    // More info: https://github.com/shoelace-style/shoelace/issues/1135
    //
    const getOffsetParent =
      this.strategy === "fixed"
        ? platform.getOffsetParent
        : (element: Element) => platform.getOffsetParent(element, offsetParent);

    computePosition(anchorEl, popupEl, {
      placement: this.placement,
      middleware,
      strategy: this.strategy,
      platform: {
        ...platform,
        getOffsetParent,
      },
    }).then(({ x, y, middlewareData, placement }) => {
      this.setAttribute("data-current-placement", placement);
      popupEl.style.left = `${x}px`;
      popupEl.style.top = `${y}px`;
    });

    this.emit(REPOSITION_EVENT);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-popup": Popup;
  }
  interface HTMLElementEventMap {
    reposition: SparkleEvent;
  }
}
