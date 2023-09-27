import { Component } from "../../../../../../packages/spec-component/src/component";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_header-sync-conflict-toolbar";

export default class HeaderSyncConflictToolbar extends Component(spec) {
  override onConnected() {
    this.ref.pullButton.addEventListener("click", this.handleClickPullButton);
    this.ref.pushButton.addEventListener("click", this.handleClickPushButton);
    this.ref.pullDialog.addEventListener("confirm", this.handleConfirmPull);
    this.ref.pushDialog.addEventListener("confirm", this.handleConfirmPush);
  }

  override onDisconnected() {
    this.ref.pullButton.removeEventListener(
      "click",
      this.handleClickPullButton
    );
    this.ref.pushButton.removeEventListener(
      "click",
      this.handleClickPushButton
    );
    this.ref.pullDialog.removeEventListener("confirm", this.handleConfirmPull);
    this.ref.pushDialog.removeEventListener("confirm", this.handleConfirmPush);
  }

  handleClickPullButton = () => {
    this.ref.pullDialog.setAttribute("open", "");
  };

  handleClickPushButton = () => {
    this.ref.pushDialog.setAttribute("open", "");
  };

  handleConfirmPull = async () => {
    await Workspace.window.resolveConflictWithPull();
  };

  handleConfirmPush = async () => {
    await Workspace.window.resolveConflictWithPush();
  };
}
