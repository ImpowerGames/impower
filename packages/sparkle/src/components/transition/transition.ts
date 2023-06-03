import SparkleElement from "../../core/sparkle-element";
import { Properties } from "../../types/properties";
import { getAttributeNameMap } from "../../utils/getAttributeNameMap";
import { getDependencyNameMap } from "../../utils/getDependencyNameMap";
import css from "./transition.css";
import html from "./transition.html";

const DEFAULT_DEPENDENCIES = getDependencyNameMap(["s-router"]);
const DEFAULT_ATTRIBUTES = getAttributeNameMap([]);

/**
 * Transitions are used to smoothly swap between two elements
 */
export default class Transition
  extends SparkleElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override tagName = "s-transition";

  static override dependencies = { ...DEFAULT_DEPENDENCIES };

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

  override get html() {
    return html;
  }

  override get styles() {
    return [Transition.augmentCss(css)];
  }

  get parentRouter(): Element | null {
    return this.closestAncestor(Transition.dependencies.router);
  }

  protected override onConnected(): void {
    const parentRouter = this.parentRouter;
    parentRouter?.addEventListener("exit", this.handleExit, true);
    parentRouter?.addEventListener("enter", this.handleEnter, true);
  }

  protected override onDisconnected(): void {
    const parentRouter = this.parentRouter;
    parentRouter?.removeEventListener("exit", this.handleExit, true);
    parentRouter?.removeEventListener("enter", this.handleEnter, true);
  }

  updateState(state: "entering" | "exiting" | null): void {
    this.updateRootAttribute("state", state);
  }

  protected handleExit = (e: Event): void => {
    if (e instanceof CustomEvent) {
      if (this.shadowRoot) {
        this.updateState("exiting");
      }
    }
  };

  protected handleEnter = (e: Event): void => {
    if (e instanceof CustomEvent) {
      if (this.shadowRoot) {
        this.updateState("entering");
      }
    }
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "s-transition": Transition;
  }
}
