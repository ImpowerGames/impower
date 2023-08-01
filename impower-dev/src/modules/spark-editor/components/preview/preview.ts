import SEElement from "../../core/se-element";
import { Workspace } from "../../workspace/Workspace";
import component from "./_preview";

export default class Preview extends SEElement {
  static override async define(
    tag = "se-preview",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component({ store: Workspace.window.state });
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
