import { Component } from "../../../../../../packages/spec-component/src/component";
import { downloadFile } from "../../utils/downloadFile";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_preview-screenplay-toolbar";
import type Button from "../../../../../../packages/sparkle/src/components/button/button";

export default class PreviewScreenplayToolbar extends Component(spec) {
  get progressBarEl() {
    return this.ref.progressBar?.shadowRoot?.firstElementChild as HTMLElement;
  }

  override onConnected() {
    this.ref.downloadButton?.addEventListener(
      "click",
      this.handleClickDownloadButton
    );
    this.ref.modeButton?.addEventListener("click", this.handleClickModeButton);
    this.progressBarEl.style.transform = `scaleX(0)`;
  }

  override onDisconnected() {
    this.ref.downloadButton?.removeEventListener(
      "click",
      this.handleClickDownloadButton
    );
    this.ref.modeButton?.removeEventListener(
      "click",
      this.handleClickModeButton
    );
  }

  handleClickDownloadButton = async (e: Event) => {
    this.ref.downloadButton?.setAttribute("disabled", "");
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
    this.ref.downloadButton?.removeAttribute("disabled");
  };

  handleClickModeButton = (e: Event) => {
    (this.ref.modeButton as Button)?.emitChange("game");
  };
}
