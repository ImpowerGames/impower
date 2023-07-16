import SEElement from "../../core/se-element";
import component from "./_add-fab";

export default class AddFab extends SEElement {
  static override async define(
    tag = "se-add-fab",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }
}
