import { DidCreateFiles } from "../../../../../../packages/spark-editor-protocol/src/protocols/workspace/messages/DidCreateFiles";
import { DidDeleteFiles } from "../../../../../../packages/spark-editor-protocol/src/protocols/workspace/messages/DidDeleteFiles";
import { DidRenameFiles } from "../../../../../../packages/spark-editor-protocol/src/protocols/workspace/messages/DidRenameFiles";
import { WorkspaceEntry } from "../../../../../../packages/spark-editor-protocol/src/types/workspace/WorkspaceEntry";
import { Properties } from "../../../../../../packages/spark-element/src/types/properties";
import getAttributeNameMap from "../../../../../../packages/spark-element/src/utils/getAttributeNameMap";
import SEElement from "../../core/se-element";
import Workspace from "../../state/Workspace";
import getUniqueName from "../../utils/getUniqueName";
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

  protected _entries: WorkspaceEntry[] = [];

  protected override onAttributeChanged(
    name: string,
    _oldValue: string,
    newValue: string
  ): void {
    if (name === FileAddButton.attributes.directoryPath) {
      this.loadEntries(newValue);
    }
  }

  protected override onConnected(): void {
    this.loadEntries(this.directoryPath);
    window.addEventListener("message", this.handleMessage);
    this.buttonEl?.addEventListener("click", this.handleClick);
  }

  protected override onDisconnected(): void {
    window.removeEventListener("message", this.handleMessage);
    this.buttonEl?.addEventListener("click", this.handleClick);
  }

  protected handleMessage = (e: MessageEvent): void => {
    const message = e.data;
    const directory = this.directoryPath;
    if (directory) {
      const directoryUri = Workspace.instance.getWorkspaceUri(directory);
      if (
        DidCreateFiles.type.isNotification(message) ||
        DidDeleteFiles.type.isNotification(message)
      ) {
        const params = message.params;
        const files = params.files;
        const changedFileInDirectory = files.some((file) =>
          file.uri.startsWith(directoryUri)
        );
        if (changedFileInDirectory) {
          this.loadEntries(directory);
        }
      }
      if (DidRenameFiles.type.isNotification(message)) {
        const params = message.params;
        const files = params.files;
        const changedFileInDirectory = files.some(
          (file) =>
            file.oldUri.startsWith(directoryUri) ||
            file.newUri.startsWith(directoryUri)
        );
        if (changedFileInDirectory) {
          this.loadEntries(directory);
        }
      }
    }
  };

  async loadEntries(directory: string | null) {
    if (!directory) {
      this._entries = [];
      return;
    }
    this._entries = await Workspace.instance.getWorkspaceDirectory({
      directory: { uri: Workspace.instance.getWorkspaceUri(directory) },
    });
  }

  handleClick = async (e: MouseEvent) => {
    const directory = this.directoryPath;
    if (!directory) {
      return;
    }
    const fileName = this.fileName || directory.split("/").slice(-1).join("");
    const uniqueFileName = getUniqueName(
      this._entries.map((e) => e.name),
      fileName
    );
    await Workspace.instance.writeTextDocument({
      textDocument: {
        uri: Workspace.instance.getWorkspaceUri(directory, uniqueFileName),
      },
      text: "",
    });
  };
}
