import SEElement from "../../core/se-element";
import component from "./_file-options-button";

export default class FileOptionsButton extends SEElement {
  static override async define(
    tag = "se-file-options-button",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }
}
