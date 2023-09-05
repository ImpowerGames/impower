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

  get accountEl() {
    return this.getElementById("account");
  }

  get drawerEl() {
    return this.getElementByTag("s-drawer");
  }

  protected override onConnected(): void {
    this.openButtonEl?.addEventListener("click", this.handleClickOpenButton);
    this.closeButtonEl?.addEventListener("click", this.handleClickCloseButton);
    this.accountEl?.addEventListener("picking", this.handlePicking);
    this.accountEl?.addEventListener("saving", this.handleSaving);
  }

  protected override onDisconnected(): void {
    this.openButtonEl?.removeEventListener("click", this.handleClickOpenButton);
    this.closeButtonEl?.removeEventListener(
      "click",
      this.handleClickCloseButton
    );
    this.accountEl?.removeEventListener("picking", this.handlePicking);
    this.accountEl?.removeEventListener("saving", this.handleSaving);
  }

  handleClickOpenButton = () => {
    this.openDrawer();
  };

  handleClickCloseButton = () => {
    this.closeDrawer();
  };

  handlePicking = () => {
    this.closeDrawer();
  };

  handleSaving = () => {
    this.closeDrawer();
  };

  openDrawer() {
    const drawerEl = this.drawerEl;
    drawerEl?.setAttribute("open", "");
  }

  closeDrawer() {
    const drawerEl = this.drawerEl;
    drawerEl?.removeAttribute("open");
  }
}
