import { Properties } from "../../../../spark-element/src/types/properties";
import getDependencyNameMap from "../../../../spark-element/src/utils/getDependencyNameMap";
import SparkleElement, {
  DEFAULT_SPARKLE_ATTRIBUTES,
} from "../../core/sparkle-element";
import css from "./transition.css";
import html from "./transition.html";

const DEFAULT_DEPENDENCIES = getDependencyNameMap(["s-router"]);
const DEFAULT_ATTRIBUTES = {
  ...DEFAULT_SPARKLE_ATTRIBUTES,
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
    return DEFAULT_ATTRIBUTES;
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

  override get css() {
    return Transition.augmentCss(css);
  }

  protected override onConnected(): void {
    window.addEventListener("exit", this.handleExit, true);
    window.addEventListener("enter", this.handleEnter, true);
  }

  protected override onDisconnected(): void {
    window.removeEventListener("exit", this.handleExit, true);
    window.removeEventListener("enter", this.handleEnter, true);
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
