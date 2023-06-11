import SparkdownElement from "../../core/sparkdown-element";
import setupEditor from "../../utils/createEditorView";
import css from "./editor.css";
import html from "./editor.html";

export default class SparkdownEditor extends SparkdownElement {
  static override async define(
    tag = "sparkdown-editor",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get html() {
    return html;
  }

  override get css() {
    return css;
  }

  protected override onConnected(): void {
    setupEditor(this.root, {
      onFocus: (doc: string) => {
        this.dispatchEvent(
          new CustomEvent("editing", {
            bubbles: true,
            cancelable: false,
            composed: true,
            detail: doc,
          })
        );
      },
      onBlur: (doc: string) => {
        this.dispatchEvent(
          new CustomEvent("edited", {
            bubbles: true,
            cancelable: false,
            composed: true,
            detail: doc,
          })
        );
      },
    });
  }

  protected override onDisconnected(): void {}
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
