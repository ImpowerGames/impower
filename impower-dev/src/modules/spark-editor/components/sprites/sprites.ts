import SEElement from "../../core/se-element";
import component from "./_sprites";

export default class Sprites extends SEElement {
  static override async define(
    tag = "se-sprites",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }
}
