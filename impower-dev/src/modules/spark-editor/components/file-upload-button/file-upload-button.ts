import SEElement from "../../core/se-element";
import getValidFileName from "../../utils/getValidFileName";
import { Workspace } from "../../workspace/Workspace";
import component from "./_file-upload-button";

export default class FileAddButton extends SEElement {
  static override async define(
    tag = "se-file-add-button",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }

  get buttonEl() {
    return this.getElementByTag("s-button");
  }

  protected override onConnected(): void {
    this.buttonEl?.addEventListener("change", this.handleInputChange);
  }

  protected override onDisconnected(): void {
    this.buttonEl?.removeEventListener("change", this.handleInputChange);
  }

  handleInputChange = async (e: Event) => {
    const event = e as Event & {
      target: HTMLInputElement & EventTarget;
    };
    const fileList = event.target.files;
    if (fileList) {
      this.upload(fileList);
    }
  };

  async upload(fileList: FileList) {
    const projectId = Workspace.window.state.project.id;
    if (projectId) {
      if (fileList) {
        const files = await Promise.all(
          Array.from(fileList).map(async (file) => {
            const validFileName = getValidFileName(file.name);
            const data = await file.arrayBuffer();
            return {
              uri: Workspace.fs.getFileUri(projectId, validFileName),
              data,
            };
          })
        );
        await Workspace.fs.createFiles({
          files,
        });
      }
    }
  }
}
