import { Component } from "../../../../../../packages/spec-component/src/component";
import spec from "./_file-options-button";

export default class FileOptionsButton extends Component(spec) {
  get deleteOption() {
    return this.getElementById("delete-option");
  }

  override onUpdate(): void {
    const store = this.context.get();
    const syncState = store?.project?.syncState;
    if (
      syncState === "syncing" ||
      syncState === "loading" ||
      syncState === "importing" ||
      syncState === "exporting"
    ) {
      this.deleteOption?.setAttribute("disabled", "");
    } else {
      this.deleteOption?.removeAttribute("disabled");
    }
  }
}
