import { DidOpenTextDocument } from "../../../../../../packages/spark-editor-protocol/src/protocols/textDocument/messages/DidOpenTextDocument";
import { Properties } from "../../../../../../packages/spark-element/src/types/properties";
import getAttributeNameMap from "../../../../../../packages/spark-element/src/utils/getAttributeNameMap";
import SEElement from "../../core/se-element";
import Workspace from "../../state/Workspace";
import component from "./_game-preview";

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

  override get component() {
    return component();
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

  override transformHtml(html: string) {
    return SEElement.augmentHtml(html, DEFAULT_DEPENDENCIES);
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
  }

  protected override onDisconnected(): void {}

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
      DidOpenTextDocument.type.notification({
        textDocument: textDocument,
      })
    );
  }
}
