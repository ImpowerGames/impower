import { WidgetType } from "@codemirror/view";

export const PARAGRAPH_CLASS = "sp-paragraph";

export default class PrintedParagraphWidget extends WidgetType {
  constructor(
    readonly html: string,
    readonly attributes: Readonly<Record<string, string>>,
    readonly rows: number,
    readonly row: number,
  ) {
    super();
  }

  override toDOM() {
    const container = document.createElement("div");
    for (const [name, value] of Object.entries(this.attributes)) container.setAttribute(name, value);
    container.classList.add(PARAGRAPH_CLASS);
    container.style.pointerEvents = "none";
    container.innerHTML = this.html;
    return container;
  }

  override eq(other: PrintedParagraphWidget) {
    const names = Object.keys(this.attributes);
    return (
      other.html === this.html &&
      other.rows === this.rows &&
      other.row === this.row &&
      names.length === Object.keys(other.attributes).length &&
      names.every((name) => other.attributes[name] === this.attributes[name])
    );
  }

  override get estimatedHeight() {
    return this.rows * this.row;
  }
}
