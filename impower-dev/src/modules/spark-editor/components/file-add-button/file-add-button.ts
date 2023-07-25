import { Properties } from "../../../../../../packages/spark-element/src/types/properties";
import getAttributeNameMap from "../../../../../../packages/spark-element/src/utils/getAttributeNameMap";
import SEElement from "../../core/se-element";
import getUniqueFileName from "../../utils/getUniqueFileName";
import Workspace from "../../workspace/Workspace";
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

  get buttonEl() {
    return this.getElementById("button");
  }

  protected override onConnected(): void {
    this.buttonEl?.addEventListener("click", this.handleClick);
  }

  protected override onDisconnected(): void {
    this.buttonEl?.removeEventListener("click", this.handleClick);
  }

  handleClick = async (e: MouseEvent) => {
    const directory = this.directoryPath;
    if (!directory) {
      return;
    }
    const entries = await Workspace.instance.getWorkspaceEntries({
      directory: { uri: Workspace.instance.getWorkspaceUri() },
    });
    const fileNames = entries.map((e) => e.uri.split("/").slice(-1).join(""));
    const fileName = this.fileName || directory.split("/").slice(-1).join("");
    const uniqueFileName = getUniqueFileName(fileNames, fileName);
    await Workspace.instance.createFiles({
      files: [
        {
          uri: Workspace.instance.getWorkspaceUri(directory, uniqueFileName),
          data: new ArrayBuffer(0),
        },
      ],
    });
  };
}
