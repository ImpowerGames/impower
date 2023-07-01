import SparkElement from "../../../../spark-element/src/core/spark-element";
import { Properties } from "../../../../spark-element/src/types/properties";
import getAttributeNameMap from "../../../../spark-element/src/utils/getAttributeNameMap";
import createEditorView from "../../utils/createEditorView";
import { createSparkdownLanguageServerConnection } from "../../utils/createSparkdownLanguageServerConnection";
import css from "./sparkdown-script-editor.css";
import html from "./sparkdown-script-editor.html";

const DEFAULT_ATTRIBUTES = {
  ...getAttributeNameMap([
    "content-padding-top",
    "content-padding-bottom",
    "content-padding-left",
    "content-padding-right",
  ]),
};

export default class SparkdownScriptEditor
  extends SparkElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  connection = createSparkdownLanguageServerConnection();

  static override async define(
    tag = "sparkdown-script-editor",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  static override get attributes() {
    return DEFAULT_ATTRIBUTES;
  }
  override get html() {
    return html;
  }

  override get css() {
    return css;
  }

  get contentPaddingTop() {
    return this.getStringAttribute(
      SparkdownScriptEditor.attributes.contentPaddingTop
    );
  }
  set contentPaddingTop(value) {
    this.setStringAttribute(
      SparkdownScriptEditor.attributes.contentPaddingTop,
      value
    );
  }

  get contentPaddingBottom() {
    return this.getStringAttribute(
      SparkdownScriptEditor.attributes.contentPaddingBottom
    );
  }
  set contentPaddingBottom(value) {
    this.setStringAttribute(
      SparkdownScriptEditor.attributes.contentPaddingBottom,
      value
    );
  }

  get contentPaddingLeft() {
    return this.getStringAttribute(
      SparkdownScriptEditor.attributes.contentPaddingLeft
    );
  }
  set contentPaddingLeft(value) {
    this.setStringAttribute(
      SparkdownScriptEditor.attributes.contentPaddingLeft,
      value
    );
  }

  get contentPaddingRight() {
    return this.getStringAttribute(
      SparkdownScriptEditor.attributes.contentPaddingRight
    );
  }
  set contentPaddingRight(value) {
    this.setStringAttribute(
      SparkdownScriptEditor.attributes.contentPaddingRight,
      value
    );
  }

  get editorEl() {
    return this.getElementByClass("editor");
  }

  _editing = false;

  _doc = "";

  emit(event: "editing" | "edited", detail: string) {
    this.dispatchEvent(
      new CustomEvent(event, {
        bubbles: true,
        cancelable: false,
        composed: true,
        detail,
      })
    );
  }

  protected override onConnected(): void {
    const editorEl = this.editorEl;
    if (editorEl) {
      createEditorView(editorEl, {
        connection: this.connection,
        contentPadding: {
          top: this.contentPaddingTop,
          bottom: this.contentPaddingBottom,
          left: this.contentPaddingLeft,
          right: this.contentPaddingRight,
        },
        onFocus: (doc: string) => {
          this._doc = doc;
          this._editing = true;
          this.emit("editing", doc);
        },
        onBlur: (doc: string) => {
          this._doc = doc;
          this._editing = false;
          this.emit("edited", doc);
        },
      });
    }
  }

  protected override onDisconnected(): void {
    if (this._editing) {
      document.body.dispatchEvent(
        new CustomEvent("edited", {
          bubbles: true,
          cancelable: false,
          composed: true,
          detail: this._doc,
        })
      );
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "sparkdown-script-editor": SparkdownScriptEditor;
  }
  interface HTMLElementEventMap {
    editing: CustomEvent;
    edited: CustomEvent;
  }
}
