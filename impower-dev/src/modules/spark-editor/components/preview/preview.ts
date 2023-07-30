import SEElement from "../../core/se-element";
import { Workspace } from "../../workspace/Workspace";
import component from "./_preview";

const DEFAULT_DEPENDENCIES = {
  "sparkdown-screenplay-preview": "sparkdown-screenplay-preview",
};

export default class Preview extends SEElement {
  static override async define(
    tag = "se-preview",
    dependencies = DEFAULT_DEPENDENCIES,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component({ store: Workspace.window.state });
  }

  override transformHtml(html: string): string {
    return SEElement.augmentHtml(html, DEFAULT_DEPENDENCIES);
  }

  get gameToolbarEl() {
    return this.getElementById("game-toolbar");
  }

  get screenplayToolbarEl() {
    return this.getElementById("screenplay-toolbar");
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
        const value = e.detail.value;
        const gameToolbarEl = this.gameToolbarEl;
        if (gameToolbarEl) {
          gameToolbarEl.hidden = value !== "game";
        }
        const screenplayToolbarEl = this.screenplayToolbarEl;
        if (screenplayToolbarEl) {
          screenplayToolbarEl.hidden = value !== "screenplay";
        }
        Workspace.window.openedPanel("preview", value);
      }
    }
  };
}
