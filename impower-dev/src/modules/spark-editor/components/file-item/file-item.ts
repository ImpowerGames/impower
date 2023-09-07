import { Properties } from "../../../../../../packages/spark-element/src/types/properties";
import getAttributeNameMap from "../../../../../../packages/spark-element/src/utils/getAttributeNameMap";
import SEElement from "../../core/se-element";
import { Workspace } from "../../workspace/Workspace";
import component from "./_file-item";

const DEFAULT_ATTRIBUTES = {
  ...getAttributeNameMap(["filename"]),
};

export default class FileItem
  extends SEElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override get attributes() {
    return DEFAULT_ATTRIBUTES;
  }

  static override async define(
    tag = "se-file-item",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }

  get filename(): string | null {
    return this.getStringAttribute(FileItem.attributes.filename);
  }
  set filename(value) {
    this.setStringAttribute(FileItem.attributes.filename, value);
  }

  get buttonEl() {
    return this.getElementByTag("s-button");
  }

  get dropdownEl() {
    return this.getElementById("dropdown");
  }

  protected override onConnected(): void {
    this.buttonEl?.addEventListener("click", this.handleButtonClick);
    this.addEventListener("changing", this.handleChanging);
  }

  protected override onDisconnected(): void {
    this.buttonEl?.removeEventListener("click", this.handleButtonClick);
    this.removeEventListener("changing", this.handleChanging);
  }

  handleButtonClick = (e: Event) => {
    e.stopPropagation();
    const filename = this.filename;
    if (filename) {
      Workspace.window.openedFileEditor(filename);
    }
  };

  handleChanging = (e: Event) => {
    if (e instanceof CustomEvent) {
      if (e.detail.key === "file-options") {
        const filename = this.filename;
        if (filename) {
          if (e.detail.value === "delete") {
            const projectId = Workspace.window.state.project.id;
            if (projectId) {
              const uri = Workspace.fs.getFileUri(projectId, filename);
              Workspace.fs.deleteFiles({
                files: [{ uri }],
              });
            }
          }
        }
      }
    }
  };
}
