import { Component } from "../../../../../../packages/spec-component/src/component";
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
    const projectId = this.stores.workspace.current.project.id ?? "";
    if (projectId) {
      // TODO:
      // const remoteProjectFile = await Workspace.sync.google.getFile(projectId);
      // await Workspace.window.pullRemoteTextChanges(remoteProjectFile);
    }
  };

  handleConfirmPush = async () => {
    const projectId = this.stores.workspace.current.project.id ?? "";
    if (projectId) {
      // TODO:
      // const localMetadata = await Workspace.fs.readProjectMetadata(projectId);
      // const localProjectName = await Workspace.fs.readProjectName(projectId);
      // const localProjectContent = await Workspace.fs.readProjectTextContent(
      //   projectId
      // );
      // const localProjectFile = {
      //   id: projectId,
      //   name: `${localProjectName}.project`,
      //   text: localProjectContent,
      //   headRevisionId: localMetadata.documentBundleRevisionId,
      //   modifiedTime: localMetadata.modifiedTime,
      // };
      // Workspace.window.pushLocalTextChanges(localProjectFile);
    }
  };
}
