import { Component } from "../../../../../../packages/spec-component/src/component";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_header-sync-conflict-toolbar";

export default class HeaderSyncConflictToolbar extends Component(spec) {
  override onConnected() {
    this.refs.pullButton.addEventListener("click", this.handleClickPullButton);
    this.refs.pushButton.addEventListener("click", this.handleClickPushButton);
    this.refs.pullDialog.addEventListener("confirm", this.handleConfirmPull);
    this.refs.pushDialog.addEventListener("confirm", this.handleConfirmPush);
  }

  override onDisconnected() {
    this.refs.pullButton.removeEventListener(
      "click",
      this.handleClickPullButton
    );
    this.refs.pushButton.removeEventListener(
      "click",
      this.handleClickPushButton
    );
    this.refs.pullDialog.removeEventListener("confirm", this.handleConfirmPull);
    this.refs.pushDialog.removeEventListener("confirm", this.handleConfirmPush);
  }

  handleClickPullButton = () => {
    this.refs.pullDialog.setAttribute("open", "");
  };

  handleClickPushButton = () => {
    this.refs.pushDialog.setAttribute("open", "");
  };

  handleConfirmPull = async () => {
    await Workspace.window.resolveConflictWithPull();
  };

  handleConfirmPush = async () => {
    await Workspace.window.resolveConflictWithPush();
  };
}
