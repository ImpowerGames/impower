import { EditorView, WidgetType } from "@codemirror/view";

export const PARAGRAPH_CLASS = "sp-paragraph";

export type PrintedPart = { html: string; rows: number } | { widget: WidgetType; rows: number };

const partHeight = (part: PrintedPart, row: number) =>
  part.rows * row + ("widget" in part ? Math.max(part.widget.estimatedHeight, 0) : 0);

export default class PrintedParagraphWidget extends WidgetType {
  constructor(
    readonly parts: readonly PrintedPart[],
    readonly attributes: Readonly<Record<string, string>>,
    readonly row: number,
  ) {
    super();
  }

  override toDOM(view: EditorView) {
    const container = document.createElement("div");
    for (const [name, value] of Object.entries(this.attributes)) container.setAttribute(name, value);
    container.classList.add(PARAGRAPH_CLASS);
    container.style.pointerEvents = "none";
    for (const part of this.parts) {
      if ("html" in part) container.insertAdjacentHTML("beforeend", part.html);
      else container.append(part.widget.toDOM(view));
    }
    return container;
  }

  override eq(other: PrintedParagraphWidget) {
    const names = Object.keys(this.attributes);
    return (
      other.row === this.row &&
      other.parts.length === this.parts.length &&
      other.parts.every((part, index) => {
        const mine = this.parts[index]!;
        if (part.rows !== mine.rows) return false;
        if ("html" in part) return "html" in mine && part.html === mine.html;
        return "widget" in mine && part.widget.constructor === mine.widget.constructor && part.widget.eq(mine.widget);
      }) &&
      names.length === Object.keys(other.attributes).length &&
      names.every((name) => other.attributes[name] === this.attributes[name])
    );
  }

  override get estimatedHeight() {
    return this.parts.reduce((height, part) => height + partHeight(part, this.row), 0);
  }
}
