import { WorkspaceStore } from "@impower/spark-editor-protocol/src/types";
import { Component } from "../../../../../../packages/spec-component/src/component";
import spec from "./_interaction-blocker";

export default class InteractionBlocker extends Component(spec) {
  override onUpdate(store: WorkspaceStore) {
    const syncState = store.project.syncState;
    if (
      syncState === "loading" ||
      syncState === "importing" ||
      syncState === "exporting"
    ) {
      this.hidden = false;
    } else {
      this.hidden = true;
    }
  }
}
