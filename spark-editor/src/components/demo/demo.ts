import SEElement from "../../core/se-element";
import html from "./demo.html";

export default class Demo extends SEElement {
  static override async define(
    tag = "se-demo",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get html(): string {
    return html;
  }
}
