import { Component } from "../../../../../../packages/spec-component/src/component";
import { downloadFile } from "../../utils/downloadFile";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_share-screenplay";

export default class ShareScreenplay extends Component(spec) {
  get pdfButtonEl() {
    return this.ref.pdfButton.shadowRoot?.firstElementChild as HTMLElement;
  }

  get htmlButtonEl() {
    return this.ref.htmlButton.shadowRoot?.firstElementChild as HTMLElement;
  }

  get pdfProgressBarEl() {
    return this.ref.pdfProgressBar.shadowRoot?.firstElementChild as HTMLElement;
  }

  get htmlProgressBarEl() {
    return this.ref.htmlProgressBar.shadowRoot
      ?.firstElementChild as HTMLElement;
  }

  override onConnected() {
    this.ref.pdfButton.addEventListener(
      "click",
      this.handleClickPdfExportButton
    );
    this.ref.htmlButton.addEventListener(
      "click",
      this.handleClickHtmlExportButton
    );
    this.pdfProgressBarEl.style.transform = `scaleX(0)`;
    this.htmlProgressBarEl.style.transform = `scaleX(0)`;
  }

  override onDisconnected() {
    this.ref.pdfButton.removeEventListener(
      "click",
      this.handleClickPdfExportButton
    );
    this.ref.htmlButton.removeEventListener(
      "click",
      this.handleClickHtmlExportButton
    );
  }

  handleClickPdfExportButton = async (e: Event) => {
    this.pdfButtonEl.setAttribute("disabled", "");
    this.pdfProgressBarEl.style.opacity = "1";
    this.pdfProgressBarEl.style.transform = `scaleX(0)`;
    const store = this.stores.workspace.current;
    const projectId = store.project.id;
    const projectName = store.project.name;
    if (projectId && projectName) {
      const programs = Object.values((await Workspace.ls.getPrograms()) || {});
      const pdf = await Workspace.print.exportPDF(programs, (value) => {
        const scaleX = (value?.percentage ?? 0) / 100;
        this.pdfProgressBarEl.style.transform = `scaleX(${scaleX})`;
      });
      downloadFile(`${projectName}.pdf`, "application/pdf", pdf);
    }
    this.pdfProgressBarEl.style.opacity = "0";
    this.pdfProgressBarEl.style.transform = "scaleX(0)";
    this.pdfButtonEl.removeAttribute("disabled");
  };

  handleClickHtmlExportButton = async (e: Event) => {
    this.htmlButtonEl.setAttribute("disabled", "");
    this.htmlProgressBarEl.style.opacity = "1";
    this.htmlProgressBarEl.style.transform = `scaleX(0)`;
    const store = this.stores.workspace.current;
    const projectId = store.project.id;
    const projectName = store.project.name;
    if (projectId && projectName) {
      const programs = Object.values((await Workspace.ls.getPrograms()) || {});
      const html = await Workspace.print.exportHTML(programs, (value) => {
        const scaleX = (value?.percentage ?? 0) / 100;
        this.pdfProgressBarEl.style.transform = `scaleX(${scaleX})`;
      });
      downloadFile(`${projectName}.html`, "text/html", html);
    }
    this.htmlProgressBarEl.style.opacity = "0";
    this.htmlProgressBarEl.style.transform = "scaleX(0)";
    this.htmlButtonEl.removeAttribute("disabled");
  };
}
