import SEElement from "../../core/se-element";
import component from "./_audio";

export default class Audio extends SEElement {
  static override async define(
    tag = "se-audio",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }
}
