import SEElement from "../../core/se-element";
import component from "./_header-menu-button";

export default class HeaderMenuButton extends SEElement {
  static override async define(
    tag = "se-header-menu-button",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }

  get openButtonEl() {
    return this.getElementById("open-button");
  }

  get closeButtonEl() {
    return this.getElementById("close-button");
  }

  get googleSyncEl() {
    return this.getElementById("google-sync");
  }

  get drawerEl() {
    return this.getElementByTag("s-drawer");
  }

  protected override onConnected(): void {
    this.openButtonEl?.addEventListener("click", this.handleClickOpenButton);
    this.closeButtonEl?.addEventListener("click", this.handleClickCloseButton);
    this.googleSyncEl?.addEventListener("picking", this.handlePicking);
  }

  protected override onDisconnected(): void {
    this.openButtonEl?.removeEventListener("click", this.handleClickOpenButton);
    this.closeButtonEl?.removeEventListener(
      "click",
      this.handleClickCloseButton
    );
    this.googleSyncEl?.removeEventListener("picking", this.handlePicking);
  }

  handleClickOpenButton = () => {
    const drawerEl = this.drawerEl;
    drawerEl?.setAttribute("open", "");
  };

  handleClickCloseButton = () => {
    const drawerEl = this.drawerEl;
    drawerEl?.removeAttribute("open");
  };

  handlePicking = () => {
    const drawerEl = this.drawerEl;
    drawerEl?.removeAttribute("open");
  };
}
