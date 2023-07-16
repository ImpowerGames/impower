import SEElement from "../../core/se-element";
import component from "./_setup";

export default class Setup extends SEElement {
  static override async define(
    tag = "se-setup",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }
}
