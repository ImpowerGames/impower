import { DidCreateFiles } from "../../../../../../packages/spark-editor-protocol/src/protocols/workspace/messages/DidCreateFiles";
import { DidDeleteFiles } from "../../../../../../packages/spark-editor-protocol/src/protocols/workspace/messages/DidDeleteFiles";
import { DidRenameFiles } from "../../../../../../packages/spark-editor-protocol/src/protocols/workspace/messages/DidRenameFiles";
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
   * The directory path to read from.
   */
  get directoryPath(): string | null {
    return this.getStringAttribute(FileList.attributes.directoryPath);
  }
  set directoryPath(value) {
    this.setStringAttribute(FileList.attributes.directoryPath, value);
  }

  get contentTemplates(): HTMLTemplateElement[] {
    const slot = this.contentSlot;
    if (slot) {
      return slot
        .assignedElements()
        .filter(
          (el): el is HTMLTemplateElement => el instanceof HTMLTemplateElement
        );
    }
    return [];
  }

  get emptyEl() {
    return this.getElementByClass("empty");
  }

  get emptySlot() {
    return this.getSlotByName("empty");
  }

  get outletEl() {
    return this.getElementByClass("outlet");
  }

  get outletSlot() {
    return this.getSlotByName("outlet");
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
    window.addEventListener("message", this.handleMessage);
  }

  protected override onDisconnected(): void {
    window.removeEventListener("message", this.handleMessage);
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
    const emptyEl = this.emptyEl;
    const outletEl = this.outletEl;
    const outletSlot = this.outletSlot;
    const template = this.contentTemplates?.[0];
    outletSlot?.replaceChildren();
    if (this._entries.length > 0) {
      if (outletSlot && template) {
        this._entries.forEach((entry) => {
          const templateContent = template.content.cloneNode(true);
          const child = Array.from(templateContent.childNodes).filter(
            (n): n is HTMLElement => n instanceof HTMLElement
          )?.[0];
          if (child) {
            child.appendChild(document.createTextNode(entry.name));
            child.setAttribute("file-name", entry.name);
          }
          outletSlot.appendChild(templateContent);
        });
      }
      if (emptyEl) {
        emptyEl.hidden = true;
      }
      if (outletEl) {
        outletEl.hidden = false;
      }
    } else {
      if (emptyEl) {
        emptyEl.hidden = false;
      }
      if (outletEl) {
        outletEl.hidden = true;
      }
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-file-list": FileList;
  }
}
