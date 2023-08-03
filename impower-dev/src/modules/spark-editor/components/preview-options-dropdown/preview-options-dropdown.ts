import SEElement from "../../core/se-element";
import { Workspace } from "../../workspace/Workspace";
import component from "./_preview-options-dropdown";

export default class PreviewOptionsDropdown extends SEElement {
  static override async define(
    tag = "se-preview-options-dropdown",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component({ store: Workspace.window.state });
  }
}
