import { Component } from "../../../../../../packages/spec-component/src/component";
import { exportPdf } from "../../utils/exportPdf";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_preview-screenplay-toolbar";

export default class PreviewScreenplayToolbar extends Component(spec) {
  override onConnected() {
    this.ref.downloadButton.addEventListener(
      "click",
      this.handleClickDownloadButton
    );
  }

  override onDisconnected() {
    this.ref.downloadButton.removeEventListener(
      "click",
      this.handleClickDownloadButton
    );
  }

  handleClickDownloadButton = async (e: Event) => {
    const store = this.stores.workspace.current;
    const projectId = store.project.id;
    const projectName = store.project.name;
    if (projectId && projectName) {
      const programs = (await Workspace.fs.getPrograms(projectId)).map(
        (x) => x.program
      );
      exportPdf(`${projectName}.txt`, programs);
    }
  };
}
