import { Component } from "../../../../../../packages/spec-component/src/component";
import type Drawer from "../../../../../../packages/sparkle/src/components/drawer/drawer";
import spec from "./_header-menu-button";

export default class HeaderMenuButton extends Component(spec) {
  protected _pickingResource?: boolean;

  override onConnected() {
    this.ref.openButton.addEventListener("click", this.handleClickOpenButton);
    this.ref.closeButton.addEventListener("click", this.handleClickCloseButton);
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
  }

  handleClickOpenButton = () => {
    if (!this._pickingResource) {
      this.openDrawer();
    }
  };

  handleClickCloseButton = () => {
    this.closeDrawer();
  };

  override onStoreUpdate() {
    const store = this.stores.workspace.current;
    const pickingResource = store.screen.pickingResource;
    if (pickingResource !== this._pickingResource) {
      this._pickingResource = pickingResource;
      if (pickingResource) {
        this.closeDrawer();
      }
    }
  }

  openDrawer() {
    window.requestAnimationFrame(() => {
      const drawerEl = this.ref.drawer as Drawer;
      drawerEl.showModal();
    });
  }

  closeDrawer() {
    window.requestAnimationFrame(() => {
      const drawerEl = this.ref.drawer as Drawer;
      drawerEl.close();
    });
  }
}
