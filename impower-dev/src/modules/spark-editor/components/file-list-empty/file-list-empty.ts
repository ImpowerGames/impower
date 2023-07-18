import SEElement from "../../core/se-element";
import component from "./_file-list-empty";

export default class FileAddButton extends SEElement {
  static override async define(
    tag = "se-file-list-empty",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }
}
