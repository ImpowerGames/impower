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

  _editedDelay = 300;

  _pendingEvent = 0;

  override get html() {
    return html;
  }

  override get css() {
    return css;
  }

  willDispatchEditedEvent() {
    return this._pendingEvent;
  }

  cancelEditedEvent() {
    window.clearTimeout(this._pendingEvent);
    this._pendingEvent = 0;
  }

  protected override onConnected(): void {
    setupEditor(this.root, {
      onFocus: (doc: string) => {
        if (this.willDispatchEditedEvent()) {
          this.cancelEditedEvent();
        }
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
        if (this.willDispatchEditedEvent()) {
          this.cancelEditedEvent();
        }
        this._pendingEvent = window.setTimeout(() => {
          this.dispatchEvent(
            new CustomEvent("edited", {
              bubbles: true,
              cancelable: false,
              composed: true,
              detail: doc,
            })
          );
        }, this._editedDelay);
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
