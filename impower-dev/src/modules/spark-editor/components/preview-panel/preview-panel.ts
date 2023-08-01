import SEElement from "../../core/se-element";
import component from "./_preview-panel";

export default class PreviewPanel extends SEElement {
  static override async define(
    tag = "se-preview-panel",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }
}
