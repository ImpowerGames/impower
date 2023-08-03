import SEElement from "../../core/se-element";
import component from "./_preview-screenplay-toolbar";

export default class PreviewScreenplayToolbar extends SEElement {
  static override async define(
    tag = "se-preview-screenplay-toolbar",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }
}
