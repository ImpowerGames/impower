import SEElement from "../../core/se-element";
import html from "./logic.html";

const DEFAULT_DEPENDENCIES = {
  "sparkdown-script-editor": "sparkdown-script-editor",
};

export default class Logic extends SEElement {
  static override async define(
    tag = "se-logic",
    dependencies = DEFAULT_DEPENDENCIES,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get html() {
    return SEElement.augmentHtml(html, DEFAULT_DEPENDENCIES);
  }
}
