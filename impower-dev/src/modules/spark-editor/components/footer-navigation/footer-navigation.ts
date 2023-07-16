import SEElement from "../../core/se-element";
import component from "./_footer-navigation";

export default class FooterNavigation extends SEElement {
  static override async define(
    tag = "se-footer-navigation",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }
}
