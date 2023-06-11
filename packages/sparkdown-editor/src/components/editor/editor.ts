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

  _editedEmissionDelay = 400;

  _pendingEditedEvent = 0;

  override get html() {
    return html;
  }

  override get css() {
    return css;
  }

  willDispatchEditedEvent() {
    return this._pendingEditedEvent;
  }

  cancelEditedEvent() {
    window.clearTimeout(this._pendingEditedEvent);
    this._pendingEditedEvent = 0;
  }

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
    setupEditor(this.root, {
      onFocus: (doc: string) => {
        if (this.willDispatchEditedEvent()) {
          this.cancelEditedEvent();
        }
        this.emit("editing", doc);
      },
      onBlur: (doc: string) => {
        if (this.willDispatchEditedEvent()) {
          this.cancelEditedEvent();
        }
        this._pendingEditedEvent = window.setTimeout(() => {
          this.emit("edited", doc);
        }, this._editedEmissionDelay);
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
