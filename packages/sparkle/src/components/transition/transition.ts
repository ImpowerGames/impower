import { RefMap } from "../../../../spec-component/src/component";
import { Properties } from "../../../../spec-component/src/types/Properties";
import getAttributeNameMap from "../../../../spec-component/src/utils/getAttributeNameMap";
import SparkleElement, {
  DEFAULT_SPARKLE_ATTRIBUTES,
} from "../../core/sparkle-element";
import spec from "./_transition";

const DEFAULT_ATTRIBUTES = {
  ...DEFAULT_SPARKLE_ATTRIBUTES,
  ...getAttributeNameMap(["router"]),
};

/**
 * Transitions are used to smoothly swap between two elements
 */
export default class Transition
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
      state: this.state,
      props: this.props,
    });
  }

  override get css() {
    return spec.css;
  }

  override get selectors() {
    return spec.selectors;
  }

  override get ref() {
    return super.ref as RefMap<typeof this.selectors>;
  }

  static override get attrs() {
    return DEFAULT_ATTRIBUTES;
  }

  /**
   * The unique key that identifies the router that this transition will respond to.
   *
   * If not specified, the transition will occur for all router changes
   */
  get router(): string | null {
    return this.getStringAttribute(Transition.attrs.router);
  }
  set router(value) {
    this.setStringAttribute(Transition.attrs.router, value);
  }

  override onConnected() {
    window.addEventListener("exit", this.handleExit);
    window.addEventListener("enter", this.handleEnter);
  }

  override onDisconnected() {
    window.removeEventListener("exit", this.handleExit);
    window.removeEventListener("enter", this.handleEnter);
  }

  updateStatus(status: "entering" | "exiting" | null) {
    this.updateRootAttribute("status", status);
  }

  protected handleExit = (e: Event) => {
    if (e instanceof CustomEvent) {
      if (this.shadowRoot) {
        const routerKey = this.router;
        if (
          !routerKey ||
          (e.detail.key && (e.detail.key as string).startsWith(routerKey))
        ) {
          this.updateStatus("exiting");
        }
      }
    }
  };

  protected handleEnter = (e: Event) => {
    if (e instanceof CustomEvent) {
      if (this.shadowRoot) {
        const routerKey = this.router;
        if (
          !routerKey ||
          (e.detail.key && (e.detail.key as string).startsWith(routerKey))
        ) {
          this.updateStatus("entering");
        }
      }
    }
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "s-transition": Transition;
  }
}
