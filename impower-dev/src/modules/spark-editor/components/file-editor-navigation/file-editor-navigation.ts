import SEElement from "../../core/se-element";
import component from "./_file-editor-navigation";

export default class FileEditorNavigation extends SEElement {
  static override async define(
    tag = "se-file-editor-navigation",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }
}
