import SEElement from "../../core/se-element";
import component from "./_file-button";

export default class FileButton extends SEElement {
  static override async define(
    tag = "se-file-button",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }
}
