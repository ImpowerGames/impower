import { Properties } from "../../../../../../packages/spark-element/src/types/properties";
import getAttributeNameMap from "../../../../../../packages/spark-element/src/utils/getAttributeNameMap";
import SEElement from "../../core/se-element";
import getValidFileName from "../../utils/getValidFileName";
import { Workspace } from "../../workspace/Workspace";
import component from "./_file-upload-button";

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
    if (fileList) {
      const directory = this.directoryPath;
      if (!directory) {
        return;
      }
      const files = await Promise.all(
        Array.from(fileList).map(async (file) => {
          const validFileName = getValidFileName(file.name);
          const data = await file.arrayBuffer();
          return {
            uri: Workspace.fs.getWorkspaceUri(directory, validFileName),
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
