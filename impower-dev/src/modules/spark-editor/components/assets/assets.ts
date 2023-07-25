import SEElement from "../../core/se-element";
import component from "./_assets";

export default class Assets extends SEElement {
  static override async define(
    tag = "se-assets",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }
}
