import SparkleElement from "../../core/sparkle-element";
import { getAttributeNameMap } from "../../utils/getAttributeNameMap";
import { getCssColor } from "../../utils/getCssColor";
import css from "./skeleton.css";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

export const DEFAULT_SKELETON_ATTRIBUTES = getAttributeNameMap(["sheen-color"]);

/**
 * Skeletons are used to provide a visual representation of where content will eventually be drawn.
 */
export default class Skeleton extends SparkleElement {
  static override tagName = "s-skeleton";

  static override get attributes() {
    return { ...super.attributes, ...DEFAULT_SKELETON_ATTRIBUTES };
  }

  static override async define(
    tagName?: string,
    dependencies?: Record<string, string>
  ): Promise<CustomElementConstructor> {
    return super.define(tagName, dependencies);
  }

  override get styles(): CSSStyleSheet[] {
    return [styles];
  }

  /**
   * The color of the sheen.
   */
  get sheenColor(): string | null {
    return this.getStringAttribute(Skeleton.attributes.sheenColor);
  }
  set sheenColor(value) {
    this.setStringAttribute(Skeleton.attributes.sheenColor, value);
  }

  protected override onAttributeChanged(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    if (name === Skeleton.attributes.sheenColor) {
      this.updateRootCssVariable(name, getCssColor(newValue));
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-skeleton": Skeleton;
  }
}
