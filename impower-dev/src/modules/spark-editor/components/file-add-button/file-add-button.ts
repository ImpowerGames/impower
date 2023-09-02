import { Properties } from "../../../../../../packages/spark-element/src/types/properties";
import getAttributeNameMap from "../../../../../../packages/spark-element/src/utils/getAttributeNameMap";
import SEElement from "../../core/se-element";
import getUniqueFileName from "../../utils/getUniqueFileName";
import { Workspace } from "../../workspace/Workspace";
import component from "./_file-add-button";

const DEFAULT_ATTRIBUTES = {
  ...getAttributeNameMap(["filename"]),
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
   * The name of the new file.
   */
  get filename(): string | null {
    return this.getStringAttribute(FileAddButton.attributes.filename);
  }
  set filename(value) {
    this.setStringAttribute(FileAddButton.attributes.filename, value);
  }

  protected override onConnected(): void {
    this.addEventListener("click", this.handleClick);
  }

  protected override onDisconnected(): void {
    this.removeEventListener("click", this.handleClick);
  }

  handleClick = async (e: MouseEvent) => {
    const files = await Workspace.fs.getFiles();
    const fileUris = Object.keys(files);
    const filenames = fileUris.map((uri) => Workspace.fs.getFilename(uri));
    const filename = this.filename;
    if (filename) {
      const uniqueFileName = getUniqueFileName(filenames, filename);
      await Workspace.fs.createFiles({
        files: [
          {
            uri: Workspace.fs.getFileUri(Workspace.project.id, uniqueFileName),
            data: new ArrayBuffer(0),
          },
        ],
      });
    }
  };
}
