import { WorkspaceEntry } from "../../../../../../packages/spark-editor-protocol/src/types";
import { Properties } from "../../../../../../packages/spark-element/src/types/properties";
import getAttributeNameMap from "../../../../../../packages/spark-element/src/utils/getAttributeNameMap";
import SEElement from "../../core/se-element";
import Workspace from "../../state/Workspace";
import component from "./_file-list";

const DEFAULT_ATTRIBUTES = {
  ...getAttributeNameMap(["directory-path"]),
};

/**
 * Progress bars are used to show the status of an ongoing operation.
 */
export default class FileList
  extends SEElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override get attributes() {
    return DEFAULT_ATTRIBUTES;
  }

  static override async define(
    tagName = "se-file-list",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ): Promise<CustomElementConstructor> {
    return super.define(tagName, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }

  /**
   * The directory path to read from and write to.
   */
  get directoryPath(): string | null {
    return this.getStringAttribute(FileList.attributes.directoryPath);
  }
  set directoryPath(value) {
    this.setStringAttribute(FileList.attributes.directoryPath, value);
  }

  protected _entries: WorkspaceEntry[] = [];

  protected override onAttributeChanged(
    name: string,
    _oldValue: string,
    newValue: string
  ): void {
    if (name === FileList.attributes.directoryPath) {
      this.loadEntries(newValue);
    }
  }

  protected override onConnected(): void {
    this.loadEntries(this.directoryPath);
  }

  async loadEntries(directory: string | null) {
    if (!directory) {
      this._entries = [];
      return;
    }
    this._entries = await Workspace.instance.getWorkspaceDirectory({
      directory: { uri: Workspace.instance.getWorkspaceUri(directory) },
    });
    console.log(this._entries);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-file-list": FileList;
  }
}
