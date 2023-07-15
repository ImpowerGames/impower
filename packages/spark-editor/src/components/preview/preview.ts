import SEElement from "../../core/se-element";
import html from "./preview.html";

const DEFAULT_DEPENDENCIES = {
  "sparkdown-script-preview": "sparkdown-script-preview",
};

export default class Preview extends SEElement {
  static override async define(
    tag = "se-preview",
    dependencies = DEFAULT_DEPENDENCIES,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get html() {
    return SEElement.augmentHtml(html, DEFAULT_DEPENDENCIES);
  }
}
