import SparkElement from "../../../spark-element/src/core/spark-element";
import { Properties } from "../../../spark-element/src/types/properties";
import getAttributeNameMap from "../../../spark-element/src/utils/getAttributeNameMap";
import { SparkScreenplayConfig } from "../../../spark-screenplay/src/types/SparkScreenplayConfig";
import { generateSparkScriptHtml } from "../../../spark-screenplay/src/utils/generateSparkScriptHtml";
import { generateSparkTitleHtml } from "../../../spark-screenplay/src/utils/generateSparkTitleHtml";
import type { SparkProgram } from "../../../sparkdown/src/types/SparkProgram";
import css from "./spark-screenplay-preview.css";
import html from "./spark-screenplay-preview.html";

const DEFAULT_ATTRIBUTES = {
  ...getAttributeNameMap(["parsed-event", "focused-line-event"]),
};

export default class SparkScreenplayPreview
  extends SparkElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override async define(
    tag = "spark-screenplay-preview",
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
   * The event that this component will listen for to update the screenplay.
   *
   * Defaults to `parsed`
   */
  get parsedEvent(): string {
    return (
      this.getStringAttribute(SparkScreenplayPreview.attributes.parsedEvent) ||
      "parsed"
    );
  }
  set parsedEvent(value) {
    this.setStringAttribute(
      SparkScreenplayPreview.attributes.parsedEvent,
      value
    );
  }

  /**
   * The event this component fires when the user focuses a line in the screenplay.
   *
   * Defaults to `focused-line`
   */
  get focusedLineEvent(): string {
    return (
      this.getStringAttribute(
        SparkScreenplayPreview.attributes.focusedLineEvent
      ) || "focused-line"
    );
  }
  set focusedLineEvent(value) {
    this.setStringAttribute(
      SparkScreenplayPreview.attributes.focusedLineEvent,
      value
    );
  }

  get previewEl() {
    return this.getElementByClass("preview");
  }

  get titleContentEl() {
    return this.getElementById("title_content");
  }

  get scriptContentEl() {
    return this.getElementById("script_content");
  }

  protected _program?: SparkProgram;

  protected _config: SparkScreenplayConfig = {
    screenplay_print_bookmarks_for_invisible_sections: true,
    screenplay_print_dialogue_split_across_pages: true,
    screenplay_print_page_numbers: true,
    screenplay_print_scene_headers_bold: true,
    screenplay_print_scene_numbers: "left",
    screenplay_print_synopses: true,
    screenplay_print_title_page: true,
  };

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
    window.addEventListener(this.parsedEvent, this.handleParsed);
  }

  protected override onDisconnected(): void {
    window.removeEventListener(this.parsedEvent, this.handleParsed);
  }

  protected handleParsed = (e: Event): void => {
    if (e instanceof CustomEvent && e.detail) {
      if (this.shadowRoot) {
        const detail = e.detail;
        const program = detail.program;
        this._program = program;
        const titleHtml = generateSparkTitleHtml(program, this._config);
        if (this.titleContentEl) {
          this.titleContentEl.innerHTML = titleHtml;
        }
        const scriptHtml = generateSparkScriptHtml(program, this._config);
        if (this.scriptContentEl) {
          this.scriptContentEl.innerHTML = scriptHtml;
        }
      }
    }
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "spark-screenplay-preview": SparkScreenplayPreview;
  }
  interface HTMLElementEventMap {
    editing: CustomEvent;
    edited: CustomEvent;
  }
}
