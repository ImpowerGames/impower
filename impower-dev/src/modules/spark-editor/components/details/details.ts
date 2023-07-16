import SEElement from "../../core/se-element";
import component from "./_details";

export default class Details extends SEElement {
  static override async define(
    tag = "se-details",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }
}
