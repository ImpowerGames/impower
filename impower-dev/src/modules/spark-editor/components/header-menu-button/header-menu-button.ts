import { Component } from "../../../../../../packages/spec-component/src/component";
import spec from "./_header-menu-button";

export default class HeaderMenuButton extends Component(spec) {
  override onConnected() {
    this.ref.openButton.addEventListener("click", this.handleClickOpenButton);
    this.ref.closeButton.addEventListener("click", this.handleClickCloseButton);
    this.ref.account.addEventListener("picking", this.handlePicking);
    this.ref.account.addEventListener("saving", this.handleSaving);
  }

  override onDisconnected() {
    this.ref.openButton.removeEventListener(
      "click",
      this.handleClickOpenButton
    );
    this.ref.closeButton.removeEventListener(
      "click",
      this.handleClickCloseButton
    );
    this.ref.account.removeEventListener("picking", this.handlePicking);
    this.ref.account.removeEventListener("saving", this.handleSaving);
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
    const drawerEl = this.ref.drawer;
    drawerEl.setAttribute("open", "");
  }

  closeDrawer() {
    const drawerEl = this.ref.drawer;
    drawerEl.removeAttribute("open");
  }
}
