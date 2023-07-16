import SEElement from "../../core/se-element";
import component from "./_graphics";

export default class Graphics extends SEElement {
  static override async define(
    tag = "se-graphics",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }
}
