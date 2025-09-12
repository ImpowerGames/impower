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
      this.refs.deleteOption.setAttribute("disabled", "");
      this.refs.renameOption.setAttribute("disabled", "");
    } else {
      this.refs.deleteOption.removeAttribute("disabled");
      this.refs.renameOption.removeAttribute("disabled");
    }
  }
}
