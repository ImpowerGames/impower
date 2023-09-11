import { Properties } from "../../../../spec-component/src/types/Properties";
import getAttributeNameMap from "../../../../spec-component/src/utils/getAttributeNameMap";
import SparkleElement, {
  DEFAULT_SPARKLE_ATTRIBUTES,
} from "../../core/sparkle-element";
import { offsetParent } from "../../utils/composed-offset-position";
import { nextAnimationFrame } from "../../utils/nextAnimationFrame";
import spec from "./_popup";
import { flip } from "./floating-ui/core/src/middleware/flip";
import { offset } from "./floating-ui/core/src/middleware/offset";
import { shift } from "./floating-ui/core/src/middleware/shift";
import { size } from "./floating-ui/core/src/middleware/size";
import { computePosition } from "./floating-ui/dom/src";
import { platform } from "./floating-ui/dom/src/platform";

const REPOSITION_EVENT = "reposition";

const DEFAULT_ATTRIBUTES = {
  ...DEFAULT_SPARKLE_ATTRIBUTES,
  ...getAttributeNameMap([
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
    "sync-size",
    "auto-size-boundary",
    "auto-size-padding",
  ]),
};

/**
 * Popup is a utility that lets you declaratively anchor "popup" containers to another element.
 */
export default class Popup
  extends SparkleElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override get tag() {
    return spec.tag;
  }

  override get html() {
    return this.getHTML(spec, { props: {}, state: {} });
  }

  override get css() {
    return this.getCSS(spec);
  }

  static override get attrs() {
    return DEFAULT_ATTRIBUTES;
  }

  /**
   * The element the popup will be anchored to. If the anchor lives outside of the popup, you can provide its `id` or a
   * reference to it here. If the anchor lives inside the popup, use the `anchor` slot instead.
   */
  get anchor(): string | null {
    return this.getStringAttribute(Popup.attrs.anchor);
  }
  set anchor(value) {
    this.setStringAttribute(Popup.attrs.anchor, value);
  }

  /**
   * Activates the positioning logic and shows the popup. When this attribute is removed, the positioning logic is torn
   * down and the popup will be hidden.
   */
  get open(): boolean {
    return this.getBooleanAttribute(Popup.attrs.open);
  }
  set open(value: boolean) {
    this.setBooleanAttribute(Popup.attrs.open, value);
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
    return this.getStringAttribute(Popup.attrs.placement) || "top";
  }
  set placement(value) {
    this.setStringAttribute(Popup.attrs.placement, value);
  }

  /**
   * Determines how the popup is positioned. The `absolute` strategy works well in most cases, but if overflow is
   * clipped, using a `fixed` position strategy can often workaround it.
   */
  get strategy(): "absolute" | "fixed" {
    return this.getStringAttribute(Popup.attrs.strategy) || "absolute";
  }
  set strategy(value) {
    this.setStringAttribute(Popup.attrs.strategy, value);
  }

  /**
   * The distance in pixels from which to offset the panel away from its anchor.
   */
  get distance(): number | null {
    return this.getNumberAttribute(Popup.attrs.distance) ?? 8;
  }
  set distance(value) {
    this.setStringAttribute(Popup.attrs.distance, value);
  }

  /**
   * The distance in pixels from which to offset the panel along its anchor.
   */
  get skidding(): number | null {
    return this.getNumberAttribute(Popup.attrs.skidding);
  }
  set skidding(value) {
    this.setStringAttribute(Popup.attrs.skidding, value);
  }

  /**
   * Attaches an arrow to the popup. The arrow's size and color can be customized using the `--arrow-size` and
   * `--arrow-color` custom properties. For additional customizations, you can also target the arrow using
   * `::part(arrow)` in your stylesheet.
   */
  get arrow(): boolean {
    return this.getBooleanAttribute(Popup.attrs.arrow);
  }
  set arrow(value) {
    this.setStringAttribute(Popup.attrs.arrow, value);
  }

  /**
   * The placement of the arrow. The default is `anchor`, which will align the arrow as close to the center of the
   * anchor as possible, considering available space and `arrow-padding`. A value of `start`, `end`, or `center` will
   * align the arrow to the start, end, or center of the popover instead.
   */
  get arrowPlacement(): "anchor" | "start" | "end" | "center" | null {
    return this.getStringAttribute(Popup.attrs.arrowPlacement);
  }
  set arrowPlacement(value) {
    this.setStringAttribute(Popup.attrs.arrowPlacement, value);
  }

  /**
   * The amount of padding between the arrow and the edges of the popup. If the popup has a border-radius, for example,
   * this will prevent it from overflowing the corners.
   */
  get arrowPadding(): number | null {
    return this.getNumberAttribute(Popup.attrs.arrowPadding);
  }
  set arrowPadding(value) {
    this.setStringAttribute(Popup.attrs.arrowPadding, value);
  }

  /**
   * By default, when the popup's position will cause it to be clipped,
   * it will automatically flip to the opposite site to keep it in view.
   * This disables that behavior.
   * You can use `flipFallbackPlacements` to further configure how the fallback placement is determined.
   */
  get disableAutoFlip(): boolean {
    return this.getBooleanAttribute(Popup.attrs.disableAutoFlip);
  }
  set disableAutoFlip(value) {
    this.setStringAttribute(Popup.attrs.disableAutoFlip, value);
  }

  /**
   * If the preferred placement doesn't fit, popup will be tested in these fallback placements until one fits. Must be a
   * string of any number of placements separated by a space, e.g. "top bottom left". If no placement fits, the flip
   * fallback strategy will be used instead.
   * */
  get flipFallbackPlacements(): string | null {
    return this.getStringAttribute(Popup.attrs.flipFallbackPlacements);
  }
  set flipFallbackPlacements(value) {
    this.setStringAttribute(Popup.attrs.flipFallbackPlacements, value);
  }

  /**
   * When neither the preferred placement nor the fallback placements fit, this value will be used to determine whether
   * the popup should be positioned using the best available fit based on available space or as it was initially
   * preferred.
   */
  get flipFallbackStrategy(): "best-fit" | "initial" | null {
    return this.getStringAttribute(Popup.attrs.flipFallbackStrategy);
  }
  set flipFallbackStrategy(value) {
    this.setStringAttribute(Popup.attrs.flipFallbackStrategy, value);
  }

  /**
   * The id of the clipping element(s) that overflow will be checked relative to when flipping. By
   * default, the boundary includes overflow ancestors that will cause the element to be clipped. If needed, you can
   * change the boundary by passing a reference to one or more elements to this property.
   */
  get flipBoundary(): string | null {
    return this.getStringAttribute(Popup.attrs.flipBoundary);
  }
  set flipBoundary(value) {
    this.setStringAttribute(Popup.attrs.flipBoundary, value);
  }

  /**
   * The amount of padding, in pixels, to exceed before the flip behavior will occur.
   */
  get flipPadding(): number | null {
    return this.getNumberAttribute(Popup.attrs.flipPadding);
  }
  set flipPadding(value) {
    this.setStringAttribute(Popup.attrs.flipPadding, value);
  }

  /**
   * By default, the when the popup's position will cause it to be clipped,
   * the popup will automatically reposition itself along the axis to keep it in view.
   * This disables that behavior.
   */
  get disableAutoShift(): boolean {
    return this.getBooleanAttribute(Popup.attrs.disableAutoShift);
  }
  set disableAutoShift(value) {
    this.setStringAttribute(Popup.attrs.disableAutoShift, value);
  }

  /**
   * The id of the clipping element(s) that overflow will be checked relative to when shifting. By
   * default, the boundary includes overflow ancestors that will cause the element to be clipped. If needed, you can
   * change the boundary by passing a reference to one or more elements to this property.
   */
  get shiftBoundary(): string | null {
    return this.getStringAttribute(Popup.attrs.shiftBoundary);
  }
  set shiftBoundary(value) {
    this.setStringAttribute(Popup.attrs.shiftBoundary, value);
  }

  /**
   * The amount of padding, in pixels, to exceed before the shift behavior will occur.
   */
  get shiftPadding(): number | null {
    return this.getNumberAttribute(Popup.attrs.shiftPadding);
  }
  set shiftPadding(value) {
    this.setStringAttribute(Popup.attrs.shiftPadding, value);
  }

  /**
   * When set, this will cause the popup to automatically resize itself to prevent it from overflowing.
   */
  get autoSize(): "horizontal" | "vertical" | "both" | null {
    return this.getStringAttribute(Popup.attrs.autoSize);
  }
  set autoSize(value) {
    this.setStringAttribute(Popup.attrs.autoSize, value);
  }

  /**
   * Syncs the popup's width or height to that of the anchor element.
   */
  get syncSize(): "width" | "height" | "both" | null {
    return this.getStringAttribute(Popup.attrs.syncSize);
  }
  set syncSize(value) {
    this.setStringAttribute(Popup.attrs.syncSize, value);
  }

  /**
   * The id of the clipping element(s) that overflow will be checked relative to when resizing. By
   * default, the boundary includes overflow ancestors that will cause the element to be clipped. If needed, you can
   * change the boundary by passing a reference to one or more elements to this property.
   */
  get autoSizeBoundary(): string | null {
    return this.getStringAttribute(Popup.attrs.autoSizeBoundary);
  }
  set autoSizeBoundary(value) {
    this.setStringAttribute(Popup.attrs.autoSizeBoundary, value);
  }

  /**
   * The amount of padding, in pixels, to exceed before the auto-size behavior will occur.
   */
  get autoSizePadding(): number | null {
    return this.getNumberAttribute(Popup.attrs.autoSizePadding);
  }
  set autoSizePadding(value) {
    this.setStringAttribute(Popup.attrs.autoSizePadding, value);
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

  protected _intersectionObserver?: IntersectionObserver;

  override onAttributeChanged(name: string, newValue: string): void {
    if (name === Popup.attrs.strategy) {
      const fixed = newValue === "fixed";
      if (fixed) {
        this.popupEl?.classList.add("fixed");
      } else {
        this.popupEl?.classList.remove("fixed");
      }
    }

    // Update the anchorEl when anchor changes
    if (name === Popup.attrs.anchor) {
      this.setupAnchor();
    }

    if ((Object.values(DEFAULT_ATTRIBUTES) as string[]).includes(name)) {
      this.reposition();
    }
  }

  override onConnected(): void {}

  override onParsed(): void {
    this.start();
    window.addEventListener("resize", this.update);
  }

  override onDisconnected(): void {
    this._intersectionObserver?.disconnect();
    this.stop();
    window.removeEventListener("resize", this.update);
  }

  override onContentAssigned() {
    this.setupAnchor();
  }

  async setupAnchor() {
    await this.stop();
    await this.start();
  }

  protected async start(): Promise<void> {
    await nextAnimationFrame();
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

  protected async stop(): Promise<void> {
    await nextAnimationFrame();
    this.removeAttribute("data-current-placement");
    this.updateRootCssVariable("--auto-size-available-width", null);
    this.updateRootCssVariable("--auto-size-available-height", null);
  }

  update = (): void => {
    this.reposition();
  };

  /** Forces the popup to recalculate and reposition itself. */
  async reposition(): Promise<void> {
    await nextAnimationFrame();
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
    if (this.syncSize) {
      middleware.push(
        size({
          apply: (args: {
            rects: { reference: { width: number; height: number } };
          }) => {
            const { rects } = args;
            const syncWidth =
              this.syncSize === "width" || this.syncSize === "both";
            const syncHeight =
              this.syncSize === "height" || this.syncSize === "both";
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
      const flipBoundary = this.flipBoundary;
      middleware.push(
        flip({
          boundary: flipBoundary
            ? this.getElementById(flipBoundary)
            : undefined,
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
      const shiftBoundary = this.shiftBoundary;
      middleware.push(
        shift({
          boundary: shiftBoundary
            ? this.getElementById(shiftBoundary)
            : undefined,
          padding: this.shiftPadding || 0,
        })
      );
    }

    // Now we adjust the size as needed
    if (this.autoSize) {
      const autoSizeBoundary = this.autoSizeBoundary;
      middleware.push(
        size({
          boundary: autoSizeBoundary
            ? this.getElementById(autoSizeBoundary)
            : undefined,
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
    reposition: CustomEvent;
  }
}
