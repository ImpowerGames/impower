import SEElement from "../../core/se-element";
import component from "./_option-button";

export default class OptionButton extends SEElement {
  static override async define(
    tag = "se-option-button",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }
}
