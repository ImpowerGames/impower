import { LoadPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/LoadPreviewMessage.js";
import { Properties } from "../../../../../../packages/spark-element/src/types/properties";
import getAttributeNameMap from "../../../../../../packages/spark-element/src/utils/getAttributeNameMap";
import SEElement from "../../core/se-element";
import { Workspace } from "../../workspace/Workspace";
import component from "./_screenplay-preview";

const DEFAULT_DEPENDENCIES = {
  "sparkdown-screenplay-preview": "sparkdown-screenplay-preview",
};

const DEFAULT_ATTRIBUTES = {
  ...getAttributeNameMap(["file-path"]),
};

export default class ScreenplayPreview
  extends SEElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override get attributes() {
    return { ...super.attributes, ...DEFAULT_ATTRIBUTES };
  }

  static override async define(
    tag = "se-screenplay-preview",
    dependencies = DEFAULT_DEPENDENCIES,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }

  override transformHtml(html: string) {
    return SEElement.augmentHtml(html, DEFAULT_DEPENDENCIES);
  }

  /**
   * The file path to read from and write to.
   */
  get filePath(): string | null {
    return this.getStringAttribute(ScreenplayPreview.attributes.filePath);
  }
  set filePath(value) {
    this.setStringAttribute(ScreenplayPreview.attributes.filePath, value);
  }

  protected override onAttributeChanged(
    name: string,
    _oldValue: string,
    newValue: string
  ): void {
    if (name === ScreenplayPreview.attributes.filePath) {
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
    const uri = Workspace.fs.getWorkspaceUri(filePath);
    const existingText = await Workspace.fs.readTextDocument({
      textDocument: { uri },
    });
    this.emit(
      LoadPreviewMessage.method,
      LoadPreviewMessage.type.request({
        type: "screenplay",
        textDocument: {
          uri,
          languageId: "sparkdown",
          version: 0,
          text: existingText,
        },
      })
    );
  }
}
