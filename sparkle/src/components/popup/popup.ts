import {
  arrow,
  autoUpdate,
  computePosition,
  flip,
  offset,
  platform,
  shift,
  size,
} from "@floating-ui/dom";
import SparkleElement from "../../core/sparkle-element";
import { getCssColor } from "../../utils/getCssColor";
import { getCssSize } from "../../utils/getCssSize";
import { offsetParent } from "./composed-offset-position";
import css from "./popup.css";
import html from "./popup.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

/**
 * Popup is a utility that lets you declaratively anchor "popup" containers to another element.
 */
export default class Popup extends SparkleElement {
  static override async define(
    tag = "s-popup",
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
      "anchor",
      "active",
      "placement",
      "strategy",
      "distance",
      "skidding",
      "arrow",
      "arrow-placement",
      "arrow-padding",
      "flip",
      "flip-fallback-placements",
      "flip-fallback-strategy",
      "flip-boundary",
      "flip-padding",
      "shift",
      "shift-boundary",
      "shift-padding",
      "auto-size",
      "sync",
      "auto-size-boundary",
      "auto-size-padding",
      "arrow-color",
      "arrow-size",
    ];
  }

  /**
   * The element the popup will be anchored to. If the anchor lives outside of the popup, you can provide its `id` or a
   * reference to it here. If the anchor lives inside the popup, use the `anchor` slot instead.
   */
  get anchor(): string | null {
    return this.getStringAttribute("anchor");
  }

  /**
   * Activates the positioning logic and shows the popup. When this attribute is removed, the positioning logic is torn
   * down and the popup will be hidden.
   */
  get active(): boolean {
    return this.getBooleanAttribute("active");
  }
  set active(value: boolean) {
    this.setBooleanAttribute("active", value);
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
    | "left-end"
    | null {
    return this.getStringAttribute("placement");
  }

  /**
   * Determines how the popup is positioned. The `absolute` strategy works well in most cases, but if overflow is
   * clipped, using a `fixed` position strategy can often workaround it.
   */
  get strategy(): "absolute" | "fixed" | null {
    return this.getStringAttribute("strategy");
  }

  /**
   * The distance in pixels from which to offset the panel away from its anchor.
   */
  get distance(): number | null {
    return this.getNumberAttribute("distance");
  }

  /**
   * The distance in pixels from which to offset the panel along its anchor.
   */
  get skidding(): number | null {
    return this.getNumberAttribute("skidding");
  }

  /**
   * Attaches an arrow to the popup. The arrow's size and color can be customized using the `--arrow-size` and
   * `--arrow-color` custom properties. For additional customizations, you can also target the arrow using
   * `::part(arrow)` in your stylesheet.
   */
  get arrow(): boolean {
    return this.getBooleanAttribute("arrow");
  }

  /**
   * The placement of the arrow. The default is `anchor`, which will align the arrow as close to the center of the
   * anchor as possible, considering available space and `arrow-padding`. A value of `start`, `end`, or `center` will
   * align the arrow to the start, end, or center of the popover instead.
   */
  get arrowPlacement(): "anchor" | "start" | "end" | "center" | null {
    return this.getStringAttribute("arrow-placement");
  }

  /**
   * The amount of padding between the arrow and the edges of the popup. If the popup has a border-radius, for example,
   * this will prevent it from overflowing the corners.
   */
  get arrowPadding(): number | null {
    return this.getNumberAttribute("arrow-padding");
  }

  /**
   * When set, placement of the popup will flip to the opposite site to keep it in view. You can use
   * `flipFallbackPlacements` to further configure how the fallback placement is determined.
   */
  get flip(): boolean {
    return this.getBooleanAttribute("flip");
  }

  /**
   * If the preferred placement doesn't fit, popup will be tested in these fallback placements until one fits. Must be a
   * string of any number of placements separated by a space, e.g. "top bottom left". If no placement fits, the flip
   * fallback strategy will be used instead.
   * */
  get flipFallbackPlacements(): string | null {
    return this.getStringAttribute("flip-fallback-placements");
  }

  /**
   * When neither the preferred placement nor the fallback placements fit, this value will be used to determine whether
   * the popup should be positioned using the best available fit based on available space or as it was initially
   * preferred.
   */
  get flipFallbackStrategy(): "best-fit" | "initial" | null {
    return this.getStringAttribute("flip-fallback-strategy");
  }

  /**
   * The id of the clipping element(s) that overflow will be checked relative to when flipping. By
   * default, the boundary includes overflow ancestors that will cause the element to be clipped. If needed, you can
   * change the boundary by passing a reference to one or more elements to this property.
   */
  get flipBoundary(): string | null {
    return this.getStringAttribute("flip-boundary");
  }

  /**
   * The amount of padding, in pixels, to exceed before the flip behavior will occur.
   */
  get flipPadding(): number | null {
    return this.getNumberAttribute("flip-padding");
  }

  /**
   * Moves the popup along the axis to keep it in view when clipped.
   */
  get shift(): boolean {
    return this.getBooleanAttribute("shift");
  }

  /**
   * The id of the clipping element(s) that overflow will be checked relative to when shifting. By
   * default, the boundary includes overflow ancestors that will cause the element to be clipped. If needed, you can
   * change the boundary by passing a reference to one or more elements to this property.
   */
  get shiftBoundary(): string | null {
    return this.getStringAttribute("shift-boundary");
  }

  /**
   * The amount of padding, in pixels, to exceed before the shift behavior will occur.
   */
  get shiftPadding(): number | null {
    return this.getNumberAttribute("shift-padding");
  }

  /**
   * When set, this will cause the popup to automatically resize itself to prevent it from overflowing.
   */
  get autoSize(): "horizontal" | "vertical" | "both" | null {
    return this.getStringAttribute("auto-size");
  }

  /**
   * Syncs the popup's width or height to that of the anchor element.
   */
  get sync(): "width" | "height" | "both" | null {
    return this.getStringAttribute("sync");
  }

  /**
   * The id of the clipping element(s) that overflow will be checked relative to when resizing. By
   * default, the boundary includes overflow ancestors that will cause the element to be clipped. If needed, you can
   * change the boundary by passing a reference to one or more elements to this property.
   */
  get autoSizeBoundary(): string | null {
    return this.getStringAttribute("auto-size-boundary");
  }

  /**
   * The amount of padding, in pixels, to exceed before the auto-size behavior will occur.
   */
  get autoSizePadding(): number | null {
    return this.getNumberAttribute("auto-size-padding");
  }

  protected _anchorEl?: HTMLElement | null;

  get anchorSlot(): HTMLSlotElement | null {
    return this.getElementByClass("anchor");
  }

  get popupEl(): HTMLElement | null {
    return this.getElementByClass("popup");
  }

  get arrowEl(): HTMLElement | null {
    return this.getElementByClass("arrow");
  }

  private cleanup: ReturnType<typeof autoUpdate> | undefined;

  protected override attributeChangedCallback(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    super.attributeChangedCallback(name, oldValue, newValue);

    // Start or stop the positioner when active changes
    if (name === "active") {
      if (this.active) {
        this.start();
      } else {
        this.stop();
      }
      this.updateRootClass("active", newValue);
    }

    if (name === "strategy") {
      this.updateRootClass("fixed", newValue === "fixed");
    }

    if (name === "arrow") {
      this.updateRootClass("has-arrow", newValue);
    }

    if (name === "arrow-color") {
      this.updateRootStyle("--arrow-color", getCssColor(newValue));
    }

    if (name === "arrow-size") {
      this.updateRootStyle("--arrow-size", getCssSize(newValue));
    }

    // Update the anchorEl when anchor changes
    if (name === "anchor") {
      this.handleAnchorSlotChange();
    }

    // All other properties will trigger a reposition when active
    if (this.active) {
      window.setTimeout(() => {
        this.reposition();
      });
    }
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.anchorSlot?.addEventListener(
      "slotchange",
      this.handleAnchorSlotChange
    );
  }

  override parsedCallback(): void {
    super.parsedCallback();
    this.start();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.stop();
    this.anchorSlot?.removeEventListener(
      "slotchange",
      this.handleAnchorSlotChange
    );
  }

  getElementById(id: string | null): HTMLElement | undefined {
    const root = this.getRootNode() as Document | ShadowRoot;
    return id ? root.getElementById(id) || undefined : undefined;
  }

  private handleAnchorSlotChange = async () => {
    await this.stop();

    if (this.anchor && typeof this.anchor === "string") {
      // Locate the anchor by id
      const root = this.getRootNode() as Document | ShadowRoot;
      this._anchorEl = root.getElementById(this.anchor);
    } else {
      // Look for a slotted anchor
      this._anchorEl = this.querySelector<HTMLElement>('[slot="anchor"]');
    }

    // An element with `display: contents` cannot be used for calculating position,
    // so use the firstElementChild of the anchor instead
    if (
      this._anchorEl &&
      window.getComputedStyle(this._anchorEl).display === "contents"
    ) {
      this._anchorEl = (this._anchorEl.shadowRoot?.firstElementChild ||
        this._anchorEl?.firstElementChild) as HTMLElement;
    }

    if (!this._anchorEl) {
      throw new Error(
        "Invalid anchor element: no anchor could be found using the anchor slot or the anchor attribute."
      );
    }

    this.start();
  };

  private start() {
    const anchorEl = this._anchorEl;
    const popupEl = this.popupEl;

    if (!anchorEl || !popupEl) {
      // We can't start the positioner without an anchor or popup
      return;
    }

    this.cleanup = autoUpdate(anchorEl, popupEl, () => {
      this.reposition();
    });
  }

  private async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.cleanup) {
        this.cleanup();
        this.cleanup = undefined;
        this.removeAttribute("data-current-placement");
        this.style.removeProperty("--auto-size-available-width");
        this.style.removeProperty("--auto-size-available-height");
        requestAnimationFrame(() => resolve());
      } else {
        resolve();
      }
    });
  }

  /** Forces the popup to recalculate and reposition itself. */
  reposition() {
    const anchorEl = this._anchorEl;
    const popupEl = this.popupEl;
    // Nothing to do if the popup is inactive or the anchor doesn't exist
    if (!this.active || !anchorEl || !popupEl) {
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
    if (this.flip) {
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
    if (this.shift) {
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
            if (this.autoSize === "vertical" || this.autoSize === "both") {
              this.style.setProperty(
                "--auto-size-available-height",
                `${availableHeight}px`
              );
            } else {
              this.style.removeProperty("--auto-size-available-height");
            }

            if (this.autoSize === "horizontal" || this.autoSize === "both") {
              this.style.setProperty(
                "--auto-size-available-width",
                `${availableWidth}px`
              );
            } else {
              this.style.removeProperty("--auto-size-available-width");
            }
          },
        })
      );
    } else {
      // Cleanup styles if we're no longer using auto-size
      this.style.removeProperty("--auto-size-available-width");
      this.style.removeProperty("--auto-size-available-height");
    }

    // Finally, we add an arrow
    if (this.arrow) {
      const arrowEl = this.arrowEl;
      if (arrowEl) {
        middleware.push(
          arrow({
            element: arrowEl,
            padding: this.arrowPadding || 0,
          })
        );
      }
    }

    //
    // Use custom positioning logic if the strategy is absolute. Otherwise, fall back to the default logic.
    //
    // More info: https://github.com/shoelace-style/shoelace/issues/1135
    //
    const getOffsetParent =
      this.strategy === "absolute"
        ? (element: Element) => platform.getOffsetParent(element, offsetParent)
        : platform.getOffsetParent;

    if (!popupEl) {
      return;
    }
    computePosition(anchorEl, popupEl, {
      placement: this.placement || "top",
      middleware,
      strategy: this.strategy || "absolute",
      platform: {
        ...platform,
        getOffsetParent,
      },
    }).then(({ x, y, middlewareData, placement }) => {
      //
      // Even though we have our own localization utility, it uses different heuristics to determine RTL. Because of
      // that, we'll use the same approach that Floating UI uses.
      //
      // Source: https://github.com/floating-ui/floating-ui/blob/cb3b6ab07f95275730d3e6e46c702f8d4908b55c/packages/dom/src/utils/getDocumentRect.ts#L31
      //
      const isRtl = getComputedStyle(this).direction === "rtl";
      const side = placement.split("-")[0] || "";
      const staticSide = {
        top: "bottom",
        right: "left",
        bottom: "top",
        left: "right",
      }[side]!;

      this.setAttribute("data-current-placement", placement);

      Object.assign(popupEl.style, {
        left: `${x}px`,
        top: `${y}px`,
      });

      if (this.arrow) {
        const arrowX = middlewareData.arrow!.x;
        const arrowY = middlewareData.arrow!.y;
        let top = "";
        let right = "";
        let bottom = "";
        let left = "";

        if (this.arrowPlacement === "start") {
          // Start
          const value =
            typeof arrowX === "number"
              ? `calc(${this.arrowPadding}px - var(--arrow-padding-offset))`
              : "";
          top =
            typeof arrowY === "number"
              ? `calc(${this.arrowPadding}px - var(--arrow-padding-offset))`
              : "";
          right = isRtl ? value : "";
          left = isRtl ? "" : value;
        } else if (this.arrowPlacement === "end") {
          // End
          const value =
            typeof arrowX === "number"
              ? `calc(${this.arrowPadding}px - var(--arrow-padding-offset))`
              : "";
          right = isRtl ? "" : value;
          left = isRtl ? value : "";
          bottom =
            typeof arrowY === "number"
              ? `calc(${this.arrowPadding}px - var(--arrow-padding-offset))`
              : "";
        } else if (this.arrowPlacement === "center") {
          // Center
          left =
            typeof arrowX === "number"
              ? `calc(50% - var(--arrow-size-diagonal))`
              : "";
          top =
            typeof arrowY === "number"
              ? `calc(50% - var(--arrow-size-diagonal))`
              : "";
        } else {
          // Anchor (default)
          left = typeof arrowX === "number" ? `${arrowX}px` : "";
          top = typeof arrowY === "number" ? `${arrowY}px` : "";
        }

        const arrowEl = this.arrowEl;
        if (arrowEl) {
          Object.assign(arrowEl.style, {
            top,
            right,
            bottom,
            left,
            [staticSide]: "calc(var(--arrow-size-diagonal) * -1)",
          });
        }
      }
    });

    this.emit("s-reposition");
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-popup": Popup;
  }
}
