import { Properties } from "../../../../spark-element/src/types/properties";
import getAttributeNameMap from "../../../../spark-element/src/utils/getAttributeNameMap";
import getDependencyNameMap from "../../../../spark-element/src/utils/getDependencyNameMap";
import SparkleElement from "../../core/sparkle-element";
import component from "./_transition";

const DEFAULT_DEPENDENCIES = getDependencyNameMap(["s-router"]);

const DEFAULT_ATTRIBUTES = {
  ...getAttributeNameMap(["router"]),
};

/**
 * Transitions are used to smoothly swap between two elements
 */
export default class Transition
  extends SparkleElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override tagName = "s-transition";

  static override dependencies = DEFAULT_DEPENDENCIES;

  static override get attributes() {
    return { ...super.attributes, ...DEFAULT_ATTRIBUTES };
  }

  static override async define(
    tagName?: string,
    dependencies = DEFAULT_DEPENDENCIES,
    useShadowDom = true
  ): Promise<CustomElementConstructor> {
    return super.define(tagName, dependencies, useShadowDom);
  }

  /**
   * The unique key that identifies the router that this transition will respond to.
   *
   * If not specified, the transition will occur for all router changes
   */
  get router(): string | null {
    return this.getStringAttribute(Transition.attributes.router);
  }
  set router(value) {
    this.setStringAttribute(Transition.attributes.router, value);
  }

  override get component() {
    return component();
  }

  override transformCss(css: string) {
    return Transition.augmentCss(css);
  }

  protected override onConnected(): void {
    window.addEventListener("exit", this.handleExit);
    window.addEventListener("enter", this.handleEnter);
  }

  protected override onDisconnected(): void {
    window.removeEventListener("exit", this.handleExit);
    window.removeEventListener("enter", this.handleEnter);
  }

  updateState(state: "entering" | "exiting" | null): void {
    this.updateRootAttribute("state", state);
  }

  protected handleExit = (e: Event): void => {
    if (e instanceof CustomEvent) {
      if (this.shadowRoot) {
        const routerKey = this.router;
        if (
          !routerKey ||
          (e.detail.key && (e.detail.key as string).startsWith(routerKey))
        ) {
          this.updateState("exiting");
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
          this.updateState("entering");
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
