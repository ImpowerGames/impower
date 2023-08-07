import { Properties } from "../../../../../../packages/spark-element/src/types/properties";
import getAttributeNameMap from "../../../../../../packages/spark-element/src/utils/getAttributeNameMap";
import SEElement from "../../core/se-element";
import getUniqueFileName from "../../utils/getUniqueFileName";
import { Workspace } from "../../workspace/Workspace";
import component from "./_file-add-button";

const DEFAULT_ATTRIBUTES = {
  ...getAttributeNameMap(["directory-path", "file-name"]),
};

export default class FileAddButton
  extends SEElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override get attributes() {
    return DEFAULT_ATTRIBUTES;
  }

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

  /**
   * The directory path to write to.
   */
  get directoryPath(): string | null {
    return this.getStringAttribute(FileAddButton.attributes.directoryPath);
  }
  set directoryPath(value) {
    this.setStringAttribute(FileAddButton.attributes.directoryPath, value);
  }

  /**
   * The name of the new file.
   */
  get fileName(): string | null {
    return this.getStringAttribute(FileAddButton.attributes.fileName);
  }
  set fileName(value) {
    this.setStringAttribute(FileAddButton.attributes.fileName, value);
  }

  protected override onConnected(): void {
    this.addEventListener("click", this.handleClick);
  }

  protected override onDisconnected(): void {
    this.removeEventListener("click", this.handleClick);
  }

  handleClick = async (e: MouseEvent) => {
    const directoryPath = this.directoryPath;
    if (!directoryPath) {
      return;
    }
    const fileUris = await Workspace.fs.getFileUrisInDirectory(directoryPath);
    const fileNames = fileUris.map((uri) => Workspace.fs.getFileName(uri));
    const fileName = this.fileName;
    if (fileName) {
      const uniqueFileName = getUniqueFileName(fileNames, fileName);
      await Workspace.fs.createFiles({
        files: [
          {
            uri: Workspace.fs.getWorkspaceUri(directoryPath, uniqueFileName),
            data: new ArrayBuffer(0),
          },
        ],
      });
    }
  };
}
