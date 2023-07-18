import SEElement from "../../core/se-element";
import component from "./_scripts";

export default class Sounds extends SEElement {
  static override async define(
    tag = "se-scripts",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }
}
