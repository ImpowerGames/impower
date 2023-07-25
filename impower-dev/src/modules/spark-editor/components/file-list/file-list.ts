import { DidCreateFiles } from "../../../../../../packages/spark-editor-protocol/src/protocols/workspace/messages/DidCreateFiles";
import { DidDeleteFiles } from "../../../../../../packages/spark-editor-protocol/src/protocols/workspace/messages/DidDeleteFiles";
import { DidRenameFiles } from "../../../../../../packages/spark-editor-protocol/src/protocols/workspace/messages/DidRenameFiles";
import { WorkspaceEntry } from "../../../../../../packages/spark-editor-protocol/src/types";
import { Properties } from "../../../../../../packages/spark-element/src/types/properties";
import getAttributeNameMap from "../../../../../../packages/spark-element/src/utils/getAttributeNameMap";
import SEElement from "../../core/se-element";
import getValidFileName from "../../utils/getValidFileName";
import { verifyFileType } from "../../utils/verifyFileType";
import Workspace from "../../workspace/Workspace";
import component from "./_file-list";

const DEFAULT_ATTRIBUTES = {
  ...getAttributeNameMap(["directory-path", "accept"]),
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

  /**
   * The file types to accept when drag-and-dropping files for upload.
   */
  get accept(): string | null {
    return this.getStringAttribute(FileList.attributes.accept);
  }
  set accept(value) {
    this.setStringAttribute(FileList.attributes.accept, value);
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

  get dragoverEl() {
    return this.getElementByClass("dragover");
  }

  get outletEl() {
    return this.getElementByClass("outlet");
  }

  get outletSlot() {
    return this.getSlotByName("outlet");
  }

  protected _entries?: WorkspaceEntry[];

  protected _dragging = false;

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
    this.root.addEventListener("dragenter", this.handleDragEnter);
    this.root.addEventListener("dragleave", this.handleDragLeave);
    this.root.addEventListener("dragover", this.handleDragOver);
    this.root.addEventListener("drop", this.handleDrop);
  }

  protected override onDisconnected(): void {
    window.removeEventListener("message", this.handleMessage);
    this.root.removeEventListener("dragenter", this.handleDragEnter);
    this.root.removeEventListener("dragleave", this.handleDragLeave);
    this.root.removeEventListener("dragover", this.handleDragOver);
    this.root.removeEventListener("drop", this.handleDrop);
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

  handleDragEnter = async (_e: Event) => {
    this._dragging = true;
    this.updateState();
  };

  handleDragLeave = async (_e: Event) => {
    this._dragging = false;
    this.updateState();
  };

  handleDragOver = async (e: Event) => {
    this._dragging = true;
    e.preventDefault();
    this.updateState();
  };

  handleDrop = async (e: Event) => {
    const event = e as DragEvent;
    const accept = this.accept;
    const validFiles = Array.from(event.dataTransfer?.files || []).filter(
      (file) => verifyFileType(file.type, accept ?? "")
    );
    if (this._dragging && validFiles.length > 0) {
      event.preventDefault();
      this.upload(validFiles);
    }
    this._dragging = false;
    this.updateState();
  };

  async upload(fileArray: File[]) {
    if (fileArray) {
      const directory = this.directoryPath;
      if (!directory) {
        return;
      }
      const files = await Promise.all(
        fileArray.map(async (file) => {
          const validFileName = getValidFileName(file.name);
          const data = await file.arrayBuffer();
          return {
            uri: Workspace.instance.getWorkspaceUri(directory, validFileName),
            data,
          };
        })
      );
      await Workspace.instance.createFiles({
        files,
      });
    }
  }

  async loadEntries(directory: string | null) {
    if (!directory) {
      this._entries = [];
      return;
    }
    this._entries = await Workspace.instance.getWorkspaceEntries({
      directory: { uri: Workspace.instance.getWorkspaceUri(directory) },
    });
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
            const fileName = entry.uri.split("/").slice(-1).join("");
            const displayName = fileName.split(".")[0] ?? "";
            child.appendChild(document.createTextNode(displayName));
            child.setAttribute("file-name", fileName);
          }
          outletSlot.appendChild(templateContent);
        });
      }
    }
    this.updateState();
  }

  getState() {
    if (this._dragging && this.accept) {
      return "dragover";
    }
    if (this._entries && this._entries.length > 0) {
      return "list";
    }
    if (this._entries && this._entries.length === 0) {
      return "empty";
    }
    return null;
  }

  updateState() {
    const state = this.getState();
    const emptyEl = this.emptyEl;
    const dragoverEl = this.dragoverEl;
    const outletEl = this.outletEl;
    const els = { empty: emptyEl, dragover: dragoverEl, list: outletEl };
    Object.entries(els).forEach(([k, v]) => {
      if (v) {
        v.hidden = k !== state;
      }
    });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-file-list": FileList;
  }
}
