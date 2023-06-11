import { Properties } from "../../../../spark-element/src/types/properties";
import getAttributeNameMap from "../../../../spark-element/src/utils/getAttributeNameMap";
import SparkdownElement from "../../core/sparkdown-element";
import createEditorView from "../../utils/createEditorView";
import css from "./editor.css";
import html from "./editor.html";

const DEFAULT_ATTRIBUTES = {
  ...getAttributeNameMap([
    "content-padding-top",
    "content-padding-bottom",
    "content-padding-left",
    "content-padding-right",
  ]),
};

export default class SparkdownEditor
  extends SparkdownElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override async define(
    tag = "sparkdown-editor",
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
      SparkdownEditor.attributes.contentPaddingTop
    );
  }
  set contentPaddingTop(value) {
    this.setStringAttribute(
      SparkdownEditor.attributes.contentPaddingTop,
      value
    );
  }

  get contentPaddingBottom() {
    return this.getStringAttribute(
      SparkdownEditor.attributes.contentPaddingBottom
    );
  }
  set contentPaddingBottom(value) {
    this.setStringAttribute(
      SparkdownEditor.attributes.contentPaddingBottom,
      value
    );
  }

  get contentPaddingLeft() {
    return this.getStringAttribute(
      SparkdownEditor.attributes.contentPaddingLeft
    );
  }
  set contentPaddingLeft(value) {
    this.setStringAttribute(
      SparkdownEditor.attributes.contentPaddingLeft,
      value
    );
  }

  get contentPaddingRight() {
    return this.getStringAttribute(
      SparkdownEditor.attributes.contentPaddingRight
    );
  }
  set contentPaddingRight(value) {
    this.setStringAttribute(
      SparkdownEditor.attributes.contentPaddingRight,
      value
    );
  }

  get editorEl() {
    return this.getElementByClass("editor");
  }

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
        contentPadding: {
          top: this.contentPaddingTop,
          bottom: this.contentPaddingBottom,
          left: this.contentPaddingLeft,
          right: this.contentPaddingRight,
        },
        onFocus: (doc: string) => {
          this._doc = doc;
          this.emit("editing", doc);
        },
        onBlur: (doc: string) => {
          this._doc = doc;
          this.emit("edited", doc);
        },
      });
    }
  }

  protected override onDisconnected(): void {
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

declare global {
  interface HTMLElementTagNameMap {
    "sparkdown-editor": SparkdownEditor;
  }
  interface HTMLElementEventMap {
    editing: CustomEvent;
    edited: CustomEvent;
  }
}
