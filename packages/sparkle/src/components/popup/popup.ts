import { ComponentSpec } from "../../../../spec-component/src/types/ComponentSpec";
import { IStore } from "../../../../spec-component/src/types/IStore";
import { getAttributeNameMap } from "../../../../spec-component/src/utils/getAttributeNameMap";
import { getPropDefaultsMap } from "../../../../spec-component/src/utils/getPropDefaultsMap";
import { SparkleComponent } from "../../core/sparkle-component";
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

export const POPUP_ATTRIBUTES = getAttributeNameMap([
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
]);

export function PopupComponent<
  Props extends Record<string, unknown>,
  Stores extends Record<string, IStore>,
  Context extends Record<string, unknown>,
  Graphics extends Record<string, string>,
  Selectors extends Record<string, null | string | string[]>,
>(spec: ComponentSpec<Props, Stores, Context, Graphics, Selectors>) {
  const augmentedSpec = {
    ...spec,
    props: {
      ...(spec.props || {}),
      ...getPropDefaultsMap(POPUP_ATTRIBUTES),
    },
    selectors: {
      ...(spec.selectors || {}),
      popup: ".popup",
    },
  };
  const cls = class extends SparkleComponent(augmentedSpec) {
    /**
     * The element the popup will be anchored to. If the anchor lives outside of the popup, you can provide its `id` or a
     * reference to it here. If the anchor lives inside the popup, use the `anchor` slot instead.
     */
    get anchor(): string | null {
      return this.getStringAttribute(cls.attrs.anchor);
    }
    set anchor(value) {
      this.setStringAttribute(cls.attrs.anchor, value);
    }

    /**
     * Activates the positioning logic and shows the popup. When this attribute is removed, the positioning logic is torn
     * down and the popup will be hidden.
     */
    get open(): boolean {
      return this.getBooleanAttribute(cls.attrs.open);
    }
    set open(value: boolean) {
      this.setBooleanAttribute(cls.attrs.open, value);
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
      return this.getStringAttribute(cls.attrs.placement) || "top";
    }
    set placement(value) {
      this.setStringAttribute(cls.attrs.placement, value);
    }

    /**
     * Determines how the popup is positioned. The `absolute` strategy works well in most cases, but if overflow is
     * clipped, using a `fixed` position strategy can often workaround it.
     */
    get strategy(): "absolute" | "fixed" {
      return this.getStringAttribute(cls.attrs.strategy) || "absolute";
    }
    set strategy(value) {
      this.setStringAttribute(cls.attrs.strategy, value);
    }

    /**
     * The distance in pixels from which to offset the panel away from its anchor.
     */
    get distance(): number | null {
      return this.getNumberAttribute(cls.attrs.distance) ?? 8;
    }
    set distance(value) {
      this.setStringAttribute(cls.attrs.distance, value);
    }

    /**
     * The distance in pixels from which to offset the panel along its anchor.
     */
    get skidding(): number | null {
      return this.getNumberAttribute(cls.attrs.skidding);
    }
    set skidding(value) {
      this.setStringAttribute(cls.attrs.skidding, value);
    }

    /**
     * Attaches an arrow to the popup. The arrow's size and color can be customized using the `--arrow-size` and
     * `--arrow-color` custom properties. For additional customizations, you can also target the arrow using
     * `::part(arrow)` in your stylesheet.
     */
    get arrow(): boolean {
      return this.getBooleanAttribute(cls.attrs.arrow);
    }
    set arrow(value) {
      this.setStringAttribute(cls.attrs.arrow, value);
    }

    /**
     * The placement of the arrow. The default is `anchor`, which will align the arrow as close to the center of the
     * anchor as possible, considering available space and `arrow-padding`. A value of `start`, `end`, or `center` will
     * align the arrow to the start, end, or center of the popover instead.
     */
    get arrowPlacement(): "anchor" | "start" | "end" | "center" | null {
      return this.getStringAttribute(cls.attrs.arrowPlacement);
    }
    set arrowPlacement(value) {
      this.setStringAttribute(cls.attrs.arrowPlacement, value);
    }

    /**
     * The amount of padding between the arrow and the edges of the popup. If the popup has a border-radius, for example,
     * this will prevent it from overflowing the corners.
     */
    get arrowPadding(): number | null {
      return this.getNumberAttribute(cls.attrs.arrowPadding);
    }
    set arrowPadding(value) {
      this.setStringAttribute(cls.attrs.arrowPadding, value);
    }

    /**
     * By default, when the popup's position will cause it to be clipped,
     * it will automatically flip to the opposite site to keep it in view.
     * This disables that behavior.
     * You can use `flipFallbackPlacements` to further configure how the fallback placement is determined.
     */
    get disableAutoFlip(): boolean {
      return this.getBooleanAttribute(cls.attrs.disableAutoFlip);
    }
    set disableAutoFlip(value) {
      this.setStringAttribute(cls.attrs.disableAutoFlip, value);
    }

    /**
     * If the preferred placement doesn't fit, popup will be tested in these fallback placements until one fits. Must be a
     * string of any number of placements separated by a space, e.g. "top bottom left". If no placement fits, the flip
     * fallback strategy will be used instead.
     * */
    get flipFallbackPlacements(): string | null {
      return this.getStringAttribute(cls.attrs.flipFallbackPlacements);
    }
    set flipFallbackPlacements(value) {
      this.setStringAttribute(cls.attrs.flipFallbackPlacements, value);
    }

    /**
     * When neither the preferred placement nor the fallback placements fit, this value will be used to determine whether
     * the popup should be positioned using the best available fit based on available space or as it was initially
     * preferred.
     */
    get flipFallbackStrategy(): "best-fit" | "initial" | null {
      return this.getStringAttribute(cls.attrs.flipFallbackStrategy);
    }
    set flipFallbackStrategy(value) {
      this.setStringAttribute(cls.attrs.flipFallbackStrategy, value);
    }

    /**
     * The id of the clipping element(s) that overflow will be checked relative to when flipping. By
     * default, the boundary includes overflow ancestors that will cause the element to be clipped. If needed, you can
     * change the boundary by passing a reference to one or more elements to this property.
     */
    get flipBoundary(): string | null {
      return this.getStringAttribute(cls.attrs.flipBoundary);
    }
    set flipBoundary(value) {
      this.setStringAttribute(cls.attrs.flipBoundary, value);
    }

    /**
     * The amount of padding, in pixels, to exceed before the flip behavior will occur.
     */
    get flipPadding(): number | null {
      return this.getNumberAttribute(cls.attrs.flipPadding);
    }
    set flipPadding(value) {
      this.setStringAttribute(cls.attrs.flipPadding, value);
    }

    /**
     * By default, the when the popup's position will cause it to be clipped,
     * the popup will automatically reposition itself along the axis to keep it in view.
     * This disables that behavior.
     */
    get disableAutoShift(): boolean {
      return this.getBooleanAttribute(cls.attrs.disableAutoShift);
    }
    set disableAutoShift(value) {
      this.setStringAttribute(cls.attrs.disableAutoShift, value);
    }

    /**
     * The id of the clipping element(s) that overflow will be checked relative to when shifting. By
     * default, the boundary includes overflow ancestors that will cause the element to be clipped. If needed, you can
     * change the boundary by passing a reference to one or more elements to this property.
     */
    get shiftBoundary(): string | null {
      return this.getStringAttribute(cls.attrs.shiftBoundary);
    }
    set shiftBoundary(value) {
      this.setStringAttribute(cls.attrs.shiftBoundary, value);
    }

    /**
     * The amount of padding, in pixels, to exceed before the shift behavior will occur.
     */
    get shiftPadding(): number | null {
      return this.getNumberAttribute(cls.attrs.shiftPadding);
    }
    set shiftPadding(value) {
      this.setStringAttribute(cls.attrs.shiftPadding, value);
    }

    /**
     * When set, this will cause the popup to automatically resize itself to prevent it from overflowing.
     */
    get autoSize(): "horizontal" | "vertical" | "both" | null {
      return this.getStringAttribute(cls.attrs.autoSize);
    }
    set autoSize(value) {
      this.setStringAttribute(cls.attrs.autoSize, value);
    }

    /**
     * Syncs the popup's width or height to that of the anchor element.
     */
    get syncSize(): "width" | "height" | "both" | null {
      return this.getStringAttribute(cls.attrs.syncSize);
    }
    set syncSize(value) {
      this.setStringAttribute(cls.attrs.syncSize, value);
    }

    /**
     * The id of the clipping element(s) that overflow will be checked relative to when resizing. By
     * default, the boundary includes overflow ancestors that will cause the element to be clipped. If needed, you can
     * change the boundary by passing a reference to one or more elements to this property.
     */
    get autoSizeBoundary(): string | null {
      return this.getStringAttribute(cls.attrs.autoSizeBoundary);
    }
    set autoSizeBoundary(value) {
      this.setStringAttribute(cls.attrs.autoSizeBoundary, value);
    }

    /**
     * The amount of padding, in pixels, to exceed before the auto-size behavior will occur.
     */
    get autoSizePadding(): number | null {
      return this.getNumberAttribute(cls.attrs.autoSizePadding);
    }
    set autoSizePadding(value) {
      this.setStringAttribute(cls.attrs.autoSizePadding, value);
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

    #intersectionObserver?: IntersectionObserver;

    override onAttributeChanged(name: string, newValue: string) {
      if (name === cls.attrs.strategy) {
        const popupEl = this.refs.popup;
        if (popupEl) {
          const fixed = newValue === "fixed";
          if (fixed) {
            popupEl.classList.add("fixed");
          } else {
            popupEl.classList.remove("fixed");
          }
        }
      }

      // Update the anchorEl when anchor changes
      if (name === cls.attrs.anchor) {
        this.setupAnchor();
      }

      if ((Object.values(POPUP_ATTRIBUTES) as string[]).includes(name)) {
        this.reposition();
      }
    }

    override onConnected() {}

    override onParsed() {
      this.start();
      window.addEventListener("resize", this.update);
    }

    override onDisconnected() {
      this.#intersectionObserver?.disconnect();
      this.stop();
      window.removeEventListener("resize", this.update);
    }

    override onContentAssigned() {
      this.setupAnchor();
    }

    async setupAnchor() {
      this.stop();
      await this.start();
    }

    async start(): Promise<void> {
      await nextAnimationFrame();
      const anchorEl = this.anchorEl;
      const popupEl = this.refs.popup;
      if (!anchorEl) {
        // We can't start the positioner without an anchor
        throw new Error(
          "Invalid anchor element: no anchor could be found using the anchor slot or the anchor attribute.",
        );
      }
      if (!popupEl) {
        return;
      }
      if (!this.#intersectionObserver) {
        this.#intersectionObserver = new IntersectionObserver(this.update);
        this.#intersectionObserver?.observe(anchorEl);
      }
      await this.reposition();
    }

    stop(): void {
      this.removeAttribute("data-current-placement");
      this.updateRootCssVariable("auto-size-available-width", null);
      this.updateRootCssVariable("auto-size-available-height", null);
    }

    override update = () => {
      this.reposition();
    };

    /** Forces the popup to recalculate and reposition itself. */
    async reposition(): Promise<void> {
      await nextAnimationFrame();
      const anchorEl = this.anchorEl;
      const popupEl = this.refs.popup;
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
              if (popupEl) {
                popupEl.style.width = syncWidth
                  ? `${rects.reference.width}px`
                  : "";
                popupEl.style.height = syncHeight
                  ? `${rects.reference.height}px`
                  : "";
              }
            },
          }),
        );
      } else {
        // Cleanup styles if we're not matching width/height
        if (popupEl) {
          popupEl.style.width = "";
          popupEl.style.height = "";
        }
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
          }),
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
          }),
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
                "--_auto-size-available-height",
                autoSizeAvailableHeight,
              );
              this.updateRootCssVariable(
                "--_auto-size-available-width",
                autoSizeAvailableWidth,
              );
            },
          }),
        );
      } else {
        // Cleanup styles if we're no longer using auto-size
        this.updateRootCssVariable("auto-size-available-height", null);
        this.updateRootCssVariable("auto-size-available-width", null);
      }

      //
      // Use custom positioning logic if the strategy is absolute. Otherwise, fall back to the default logic.
      //
      // More info: https://github.com/shoelace-style/shoelace/issues/1135
      //
      const getOffsetParent =
        this.strategy === "fixed"
          ? platform.getOffsetParent
          : (element: Element) =>
              platform.getOffsetParent(element, offsetParent);

      if (popupEl) {
        const { x, y, placement } = await computePosition(anchorEl, popupEl, {
          placement: this.placement,
          middleware,
          strategy: this.strategy,
          platform: {
            ...platform,
            getOffsetParent,
          },
        });
        this.setAttribute("data-current-placement", placement);
        popupEl.style.left = `${x}px`;
        popupEl.style.top = `${y}px`;
      }

      await nextAnimationFrame();

      this.emit(REPOSITION_EVENT);
    }
  };

  return cls;
}

/**
 * Popup is a utility that lets you declaratively anchor "popup" containers to another element.
 */
export default class Popup extends PopupComponent(spec) {}

declare global {
  interface HTMLElementTagNameMap {
    "s-popup": Popup;
  }
  interface HTMLElementEventMap {
    reposition: CustomEvent;
  }
}
