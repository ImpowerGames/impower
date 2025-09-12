import type Button from "../../../../../../packages/sparkle/src/components/button/button";
import { Component } from "../../../../../../packages/spec-component/src/component";
import { downloadFile } from "../../utils/downloadFile";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_preview-screenplay-toolbar";

export default class PreviewScreenplayToolbar extends Component(spec) {
  get progressBarEl() {
    return this.refs.progressBar?.shadowRoot?.firstElementChild as HTMLElement;
  }

  override onConnected() {
    this.refs.downloadButton?.addEventListener(
      "click",
      this.handleClickDownloadButton
    );
    this.refs.modeButton?.addEventListener("click", this.handleClickModeButton);
    this.progressBarEl.style.transform = `scaleX(0)`;
  }

  override onDisconnected() {
    this.refs.downloadButton?.removeEventListener(
      "click",
      this.handleClickDownloadButton
    );
    this.refs.modeButton?.removeEventListener(
      "click",
      this.handleClickModeButton
    );
  }

  handleClickDownloadButton = async (e: Event) => {
    this.refs.downloadButton?.setAttribute("disabled", "");
    this.progressBarEl.style.opacity = "1";
    this.progressBarEl.style.transform = `scaleX(0)`;
    const store = this.stores.workspace.current;
    const projectId = store.project.id;
    const projectName = store.project.name;
    if (projectId && projectName) {
      const files = await Workspace.fs.getFiles(projectId);
      const scripts = Object.values(files)
        .filter((file) => file.type === "script")
        .map((file) => file.text || "");
      const pdf = await Workspace.print.exportPDF(scripts, (value) => {
        const scaleX = (value?.percentage ?? 0) / 100;
        this.progressBarEl.style.transform = `scaleX(${scaleX})`;
      });
      downloadFile(`${projectName}.pdf`, "application/pdf", pdf);
    }
    this.progressBarEl.style.opacity = "0";
    this.progressBarEl.style.transform = "scaleX(0)";
    this.refs.downloadButton?.removeAttribute("disabled");
  };

  handleClickModeButton = (e: Event) => {
    (this.refs.modeButton as Button)?.emitChange("game");
  };
}
