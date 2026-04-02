import { RefMap } from "../../../../spec-component/src/component";
import { ComponentSpec } from "../../../../spec-component/src/types/ComponentSpec";
import { IStore } from "../../../../spec-component/src/types/IStore";
import { getAttributeNameMap } from "../../../../spec-component/src/utils/getAttributeNameMap";
import {
  DEFAULT_SPARKLE_PROPS,
  SparkleComponent,
} from "../../core/sparkle-component";
import { offsetParent } from "../../utils/composed-offset-position";
import { nextAnimationFrame } from "../../utils/nextAnimationFrame";
import popupSpec from "./_popup";
import { flip } from "./floating-ui/core/src/middleware/flip";
import { offset } from "./floating-ui/core/src/middleware/offset";
import { shift } from "./floating-ui/core/src/middleware/shift";
import { size } from "./floating-ui/core/src/middleware/size";
import { computePosition } from "./floating-ui/dom/src";
import { platform } from "./floating-ui/dom/src/platform";

const REPOSITION_EVENT = "reposition";

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
      ...popupSpec.props,
      ...(spec.props || {}),
    },
    selectors: {
      ...popupSpec.selectors,
      ...(spec.selectors || {}),
    },
  };
  const cls = class extends SparkleComponent<
    typeof popupSpec.props,
    Stores,
    Context,
    Graphics,
    typeof popupSpec.selectors,
    typeof HTMLElement
  >(augmentedSpec as any) {
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
      if (name === this.attrs.strategy) {
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
      if (name === this.attrs.anchor) {
        this.setupAnchor();
      }

      if (
        (
          Object.values(
            getAttributeNameMap(Object.keys(popupSpec.props)),
          ) as string[]
        ).includes(name)
      ) {
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
      this.updateCssVariable("auto-size-available-width", null);
      this.updateCssVariable("auto-size-available-height", null);
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
              this.updateCssVariable(
                "--_auto-size-available-height",
                autoSizeAvailableHeight,
              );
              this.updateCssVariable(
                "--_auto-size-available-width",
                autoSizeAvailableWidth,
              );
            },
          }),
        );
      } else {
        // Cleanup styles if we're no longer using auto-size
        this.updateCssVariable("auto-size-available-height", null);
        this.updateCssVariable("auto-size-available-width", null);
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
          placement: this.placement ?? undefined,
          middleware,
          strategy: this.strategy ?? undefined,
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

  return cls as typeof cls & {
    new (...args: any[]): Props &
      InstanceType<
        ReturnType<
          typeof SparkleComponent<
            Props,
            Stores,
            Context,
            Graphics,
            Selectors,
            typeof HTMLElement
          >
        >
      > & {
        readonly attrs: Record<
          | keyof Props
          | keyof typeof DEFAULT_SPARKLE_PROPS
          | keyof typeof popupSpec.props,
          string
        >;
        readonly refs: RefMap<Selectors>;
        readonly props: Props;
        readonly stores: Stores;
        readonly context: Context;
      };
  };
}

/**
 * Popup is a utility that lets you declaratively anchor "popup" containers to another element.
 */
export default class Popup extends PopupComponent(popupSpec) {}

declare global {
  interface HTMLElementTagNameMap {
    "s-popup": Popup;
  }
  interface HTMLElementEventMap {
    reposition: CustomEvent;
  }
}
