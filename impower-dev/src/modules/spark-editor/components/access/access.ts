import SEElement from "../../core/se-element";
import component from "./_access";

export default class Access extends SEElement {
  static override async define(
    tag = "se-access",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }
}
