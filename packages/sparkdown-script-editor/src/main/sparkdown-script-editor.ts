import { EditorView } from "@codemirror/view";
import SparkElement from "../../../spark-element/src/core/spark-element";
import { Properties } from "../../../spark-element/src/types/properties";
import getAttributeNameMap from "../../../spark-element/src/utils/getAttributeNameMap";
import { DidParseParams } from "../cm-languageclient/types/DidParseTextDocument";
import createEditorView from "../utils/createEditorView";
import { createSparkdownLanguageServerConnection } from "../utils/createSparkdownLanguageServerConnection";
import css from "./sparkdown-script-editor.css";
import html from "./sparkdown-script-editor.html";

const DEFAULT_ATTRIBUTES = {
  ...getAttributeNameMap([
    "synced-event",
    "editing-event",
    "edited-event",
    "parsed-event",
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
  connection = createSparkdownLanguageServerConnection(
    new Worker("/public/sparkdown-language-server.js")
  );

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

  /**
   * The event that this component will listen for to sync the displayed document with outside changes.
   *
   * Defaults to `synced`
   */
  get syncedEvent(): string {
    return (
      this.getStringAttribute(SparkdownScriptEditor.attributes.syncedEvent) ||
      "synced"
    );
  }
  set syncedEvent(value) {
    this.setStringAttribute(
      SparkdownScriptEditor.attributes.syncedEvent,
      value
    );
  }

  /**
   * The event this component fires when the user starts editing the script.
   *
   * Defaults to `editing`
   */
  get editingEvent(): string {
    return (
      this.getStringAttribute(SparkdownScriptEditor.attributes.editingEvent) ||
      "editing"
    );
  }
  set editingEvent(value) {
    this.setStringAttribute(
      SparkdownScriptEditor.attributes.editingEvent,
      value
    );
  }

  /**
   * The event this component fires when the editor is unfocused or unloaded.
   *
   * Defaults to `edited`
   */
  get editedEvent(): string {
    return (
      this.getStringAttribute(SparkdownScriptEditor.attributes.editedEvent) ||
      "edited"
    );
  }
  set editedEvent(value) {
    this.setStringAttribute(
      SparkdownScriptEditor.attributes.editedEvent,
      value
    );
  }

  /**
   * The event this component fires whenever the script is parsed.
   *
   * Defaults to `parsed`
   */
  get parsedEvent(): string {
    return (
      this.getStringAttribute(SparkdownScriptEditor.attributes.parsedEvent) ||
      "parsed"
    );
  }
  set parsedEvent(value) {
    this.setStringAttribute(
      SparkdownScriptEditor.attributes.parsedEvent,
      value
    );
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

  protected _editing = false;

  protected _doc = "";

  protected _view?: EditorView;

  emit(event: string, detail: any) {
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
    this.root?.addEventListener(this.syncedEvent, this.handleSynced);
    const editorEl = this.editorEl;
    if (editorEl) {
      this._view = createEditorView(editorEl, {
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
          this.emit(this.editingEvent, doc);
        },
        onBlur: (doc: string) => {
          this._doc = doc;
          this._editing = false;
          this.emit(this.editedEvent, doc);
        },
      });
    }
    this.connection.parseEvent.addListener(this.handleParsed);
  }

  protected override onDisconnected(): void {
    this.root?.removeEventListener(this.syncedEvent, this.handleSynced);
    if (this._editing) {
      document.body.dispatchEvent(
        new CustomEvent(this.editedEvent, {
          bubbles: true,
          cancelable: false,
          composed: true,
          detail: this._doc,
        })
      );
    }
    this.connection.parseEvent.removeListener(this.handleParsed);
  }

  protected handleSynced = (e: Event): void => {
    if (e instanceof CustomEvent && e.detail) {
      if (this.shadowRoot) {
        const detail = e.detail;
        // TODO: Handle conflicts
        this._doc = detail;
        if (this._view) {
          this._view.dispatch({
            changes: {
              from: 0,
              to: this._view.state.doc.length,
              insert: detail,
            },
          });
        }
      }
    }
  };

  protected handleParsed = (params: DidParseParams): void => {
    this.emit(this.parsedEvent, params);
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "sparkdown-script-editor": SparkdownScriptEditor;
  }
}
