import { Component } from "../../../../../../packages/spec-component/src/component";
import spec from "./_file-options-button";

export default class FileOptionsButton extends Component(spec) {
  override onInit() {
    this.setup();
  }

  override onStoreUpdate() {
    this.setup();
  }

  setup() {
    const store = this.stores.workspace.current;
    const syncStatus = store?.sync?.status;
    if (
      syncStatus === "syncing" ||
      syncStatus === "loading" ||
      syncStatus === "importing" ||
      syncStatus === "exporting"
    ) {
      this.ref.deleteOption.setAttribute("disabled", "");
      this.ref.renameOption.setAttribute("disabled", "");
    } else {
      this.ref.deleteOption.removeAttribute("disabled");
      this.ref.renameOption.removeAttribute("disabled");
    }
  }
}
