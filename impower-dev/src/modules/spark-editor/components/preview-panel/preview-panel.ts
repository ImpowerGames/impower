import SEElement from "../../core/se-element";
import html from "./preview-panel.html";

const DEFAULT_DEPENDENCIES = {
  "sparkdown-script-preview": "sparkdown-script-preview",
};

export default class PreviewPanel extends SEElement {
  static override async define(
    tag = "se-preview-panel",
    dependencies = DEFAULT_DEPENDENCIES,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get html() {
    return SEElement.augmentHtml(html, DEFAULT_DEPENDENCIES);
  }
}
