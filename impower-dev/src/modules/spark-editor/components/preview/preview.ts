import SEElement from "../../core/se-element";
import Workspace from "../../state/Workspace";
import component, { getModeTitle } from "./_preview";

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
    return SEElement.augmentHtml(
      component(Workspace.instance.state).html,
      DEFAULT_DEPENDENCIES
    );
  }

  get modeTitleEl() {
    return this.getElementByClass("mode-title");
  }

  protected override onConnected(): void {
    this.ownerDocument.addEventListener("enter", this.handleEnter);
  }

  protected override onDisconnected(): void {
    this.ownerDocument.removeEventListener("enter", this.handleEnter);
  }

  handleEnter = (e: Event) => {
    if (e instanceof CustomEvent) {
      if (e.detail.key === "preview") {
        const mode = e.detail.value;
        Workspace.instance.state.preview.panel = mode;
        Workspace.instance.cacheState();
        const modeTitleEl = this.modeTitleEl;
        if (modeTitleEl) {
          modeTitleEl.textContent = getModeTitle(mode);
        }
      }
    }
  };
}
