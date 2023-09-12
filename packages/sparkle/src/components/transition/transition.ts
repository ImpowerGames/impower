import { Properties } from "../../../../spec-component/src/types/Properties";
import getAttributeNameMap from "../../../../spec-component/src/utils/getAttributeNameMap";
import getDependencyNameMap from "../../../../spec-component/src/utils/getDependencyNameMap";
import SparkleElement, {
  DEFAULT_SPARKLE_ATTRIBUTES,
} from "../../core/sparkle-element";
import spec from "./_transition";

const DEFAULT_DEPENDENCIES = getDependencyNameMap(["s-router"]);

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
    return spec.html({ props: this.props, state: this.state });
  }

  override get css() {
    return spec.css;
  }

  static override get dependencies() {
    return DEFAULT_DEPENDENCIES;
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

  override onConnected(): void {
    window.addEventListener("exit", this.handleExit);
    window.addEventListener("enter", this.handleEnter);
  }

  override onDisconnected(): void {
    window.removeEventListener("exit", this.handleExit);
    window.removeEventListener("enter", this.handleEnter);
  }

  updateStatus(status: "entering" | "exiting" | null): void {
    this.updateRootAttribute("status", status);
  }

  protected handleExit = (e: Event): void => {
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

  protected handleEnter = (e: Event): void => {
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
