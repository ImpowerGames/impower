import SEElement from "../../core/se-element";
import component from "./_file-list-border";

export default class FileListBorder extends SEElement {
  static override async define(
    tag = "se-file-list-border",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }
}
