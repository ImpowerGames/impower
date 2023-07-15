import { DidOpenTextDocument } from "../../../../spark-editor-protocol/src/protocols/textDocument/messages/DidOpenTextDocument";
import { DidSaveTextDocument } from "../../../../spark-editor-protocol/src/protocols/textDocument/messages/DidSaveTextDocument";
import { Properties } from "../../../../spark-element/src/types/properties";
import getAttributeNameMap from "../../../../spark-element/src/utils/getAttributeNameMap";
import Workspace from "../../classes/Workspace";
import SEElement from "../../core/se-element";
import html from "./game-preview.html";

const DEFAULT_DEPENDENCIES = {
  "spark-game-preview": "spark-game-preview",
};

const DEFAULT_ATTRIBUTES = {
  ...getAttributeNameMap(["file-path"]),
};

export default class GamePreview
  extends SEElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override get attributes() {
    return DEFAULT_ATTRIBUTES;
  }

  static override async define(
    tag = "se-game-preview",
    dependencies = DEFAULT_DEPENDENCIES,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get html() {
    return SEElement.augmentHtml(html, DEFAULT_DEPENDENCIES);
  }

  /**
   * The file path to read from and write to.
   */
  get filePath(): string | null {
    return this.getStringAttribute(GamePreview.attributes.filePath);
  }
  set filePath(value) {
    this.setStringAttribute(GamePreview.attributes.filePath, value);
  }

  protected override onAttributeChanged(
    name: string,
    _oldValue: string,
    newValue: string
  ): void {
    if (name === GamePreview.attributes.filePath) {
      this.loadFile(newValue);
    }
  }

  protected override onConnected(): void {
    this.loadFile(this.filePath);
    window.addEventListener("message", this.handleMessage);
  }

  protected override onDisconnected(): void {
    window.removeEventListener("message", this.handleMessage);
  }

  protected handleMessage = (e: MessageEvent): void => {
    const message = e.data;
    if (DidSaveTextDocument.isNotification(message)) {
      const params = message.params;
      const textDocument = params.textDocument;
      const text = params.text;
      if (text != null) {
        Workspace.instance.writeTextDocument({ textDocument, text });
      }
    }
  };

  async loadFile(filePath: string | null) {
    if (!filePath) {
      return;
    }
    const uri = Workspace.instance.getWorkspaceUri(filePath);
    const existingText = await Workspace.instance.readTextDocument({
      textDocument: { uri },
    });
    const textDocument = {
      uri,
      languageId: "sparkdown",
      version: 0,
      text: existingText,
    };
    window.postMessage(
      DidOpenTextDocument.notification({
        textDocument: textDocument,
      })
    );
  }
}
