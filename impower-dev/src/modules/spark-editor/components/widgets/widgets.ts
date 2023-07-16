import SEElement from "../../core/se-element";
import component from "./_widgets";

export default class Widgets extends SEElement {
  static override async define(
    tag = "se-widgets",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }
}
