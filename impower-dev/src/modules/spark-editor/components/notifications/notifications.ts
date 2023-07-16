import SEElement from "../../core/se-element";
import component from "./_notifications";

export default class Notifications extends SEElement {
  static override async define(
    tag = "se-notifications",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }
}
