import { Properties } from "../../../../../../packages/spark-element/src/types/properties";
import getAttributeNameMap from "../../../../../../packages/spark-element/src/utils/getAttributeNameMap";
import SEElement from "../../core/se-element";
import { Workspace } from "../../workspace/Workspace";
import component from "./_file-item";

const DEFAULT_ATTRIBUTES = {
  ...getAttributeNameMap(["pane", "panel", "directory-path", "file-name"]),
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

  /**
   * The pane where this file is displayed.
   */
  get pane(): string | null {
    return this.getStringAttribute(FileItem.attributes.pane);
  }
  set pane(value) {
    this.setStringAttribute(FileItem.attributes.pane, value);
  }

  /**
   * The panel where this file is displayed.
   */
  get panel(): string | null {
    return this.getStringAttribute(FileItem.attributes.panel);
  }
  set panel(value) {
    this.setStringAttribute(FileItem.attributes.panel, value);
  }

  /**
   * The directory path where this file is located.
   */
  get directoryPath(): string | null {
    return this.getStringAttribute(FileItem.attributes.directoryPath);
  }
  set directoryPath(value) {
    this.setStringAttribute(FileItem.attributes.directoryPath, value);
  }

  /**
   * The name of the file.
   */
  get fileName(): string | null {
    return this.getStringAttribute(FileItem.attributes.fileName);
  }
  set fileName(value) {
    this.setStringAttribute(FileItem.attributes.fileName, value);
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

  getFilePath() {
    const directoryPath = this.directoryPath;
    const fileName = this.fileName;
    if (directoryPath && fileName) {
      return `${directoryPath}/${fileName}`;
    }
    return undefined;
  }

  handleButtonClick = (e: Event) => {
    e.stopPropagation();
    const pane = this.pane;
    const panel = this.panel;
    const filePath = this.getFilePath();
    if (pane && panel && filePath) {
      Workspace.window.openedFileEditor(pane, panel, filePath);
    }
  };

  handleChanging = (e: Event) => {
    if (e instanceof CustomEvent) {
      if (e.detail.key === "file-options") {
        const filePath = this.getFilePath();
        if (filePath) {
          const uri = Workspace.fs.getWorkspaceUri(filePath);
          if (e.detail.value === "delete") {
            Workspace.fs.deleteFiles({
              files: [{ uri }],
            });
          }
        }
      }
    }
  };
}
