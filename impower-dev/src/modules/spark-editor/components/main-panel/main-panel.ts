import SEElement from "../../core/se-element";
import component from "./_main-panel";

export default class MainPanel extends SEElement {
  static override async define(
    tag = "se-main-panel",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }
}
