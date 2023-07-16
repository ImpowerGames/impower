import SEElement from "../../core/se-element";
import component from "./_maps";

export default class Maps extends SEElement {
  static override async define(
    tag = "se-maps",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }
}
