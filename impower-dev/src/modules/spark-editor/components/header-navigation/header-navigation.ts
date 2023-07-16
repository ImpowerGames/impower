import SEElement from "../../core/se-element";
import component from "./_header-navigation";

export default class HeaderNavigation extends SEElement {
  static override async define(
    tag = "se-header-navigation",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }
}
