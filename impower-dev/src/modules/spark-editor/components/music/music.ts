import SEElement from "../../core/se-element";
import component from "./_music";

export default class Music extends SEElement {
  static override async define(
    tag = "se-music",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }
}
