import SEElement from "../../core/se-element";
import html from "./notifications.html";

export default class Notifications extends SEElement {
  static override async define(
    tag = "se-notifications",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get html() {
    return html;
  }
}
