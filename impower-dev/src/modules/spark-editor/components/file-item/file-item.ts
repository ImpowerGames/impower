import { Properties } from "../../../../../../packages/spark-element/src/types/properties";
import getAttributeNameMap from "../../../../../../packages/spark-element/src/utils/getAttributeNameMap";
import SEElement from "../../core/se-element";
import Workspace from "../../state/Workspace";
import component from "./_file-item";

const DEFAULT_ATTRIBUTES = {
  ...getAttributeNameMap(["directory-path", "file-name"]),
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

  get dropdownEl() {
    return this.getElementById("dropdown");
  }

  protected override onConnected(): void {
    this.dropdownEl?.addEventListener("changing", this.handleChanging);
  }

  protected override onDisconnected(): void {
    this.dropdownEl?.addEventListener("changing", this.handleChanging);
  }

  handleChanging = async (e: Event) => {
    if (e instanceof CustomEvent) {
      const directory = this.directoryPath;
      if (directory) {
        if (e.detail.value === "delete") {
          const filename = this.fileName;
          if (filename) {
            Workspace.instance.deleteTextDocument({
              textDocument: {
                uri: Workspace.instance.getWorkspaceUri(directory, filename),
              },
            });
          }
        }
      }
    }
  };
}