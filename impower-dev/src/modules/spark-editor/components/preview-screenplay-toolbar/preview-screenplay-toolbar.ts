import { Component } from "../../../../../../packages/spec-component/src/component";
import { downloadFile } from "../../utils/downloadFile";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_preview-screenplay-toolbar";

export default class PreviewScreenplayToolbar extends Component(spec) {
  get progressBarEl() {
    return this.ref.progressBar.shadowRoot?.firstElementChild as HTMLElement;
  }

  get downloadButtonEl() {
    return this.ref.downloadButton.shadowRoot?.firstElementChild as HTMLElement;
  }

  override onConnected() {
    this.ref.downloadButton.addEventListener(
      "click",
      this.handleClickDownloadButton
    );
    this.progressBarEl.style.transform = `scaleX(0)`;
  }

  override onDisconnected() {
    this.ref.downloadButton.removeEventListener(
      "click",
      this.handleClickDownloadButton
    );
  }

  handleClickDownloadButton = async (e: Event) => {
    this.downloadButtonEl.setAttribute("disabled", "");
    this.progressBarEl.style.opacity = "1";
    this.progressBarEl.style.transform = `scaleX(0)`;
    const store = this.stores.workspace.current;
    const projectId = store.project.id;
    const projectName = store.project.name;
    if (projectId && projectName) {
      const programs = (await Workspace.fs.getPrograms(projectId)).map(
        (x) => x.program
      );
      const pdf = await Workspace.print.exportPDF(programs, (value) => {
        const scaleX = (value?.percentage ?? 0) / 100;
        this.progressBarEl.style.transform = `scaleX(${scaleX})`;
      });
      downloadFile(`${projectName}.pdf`, "application/pdf", pdf);
    }
    this.progressBarEl.style.opacity = "0";
    this.progressBarEl.style.transform = "scaleX(0)";
    this.downloadButtonEl.removeAttribute("disabled");
  };
}
