import { WorkspaceStore } from "@impower/spark-editor-protocol/src/types";
import { Component } from "../../../../../../packages/spec-component/src/component";
import { RecursiveReadonly } from "../../workspace/types/RecursiveReadonly";
import spec from "./_file-options-button";

export default class FileOptionsButton extends Component(spec) {
  get deleteOption() {
    return this.getElementById("delete-option");
  }

  override onUpdate(store?: RecursiveReadonly<WorkspaceStore>): void {
    if (store?.project?.syncState === "syncing") {
      this.deleteOption?.setAttribute("disabled", "");
    } else {
      this.deleteOption?.removeAttribute("disabled");
    }
  }
}
