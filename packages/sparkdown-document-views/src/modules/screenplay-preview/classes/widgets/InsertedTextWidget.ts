import { WidgetType } from "@codemirror/view";

export default class InsertedTextWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly style = "",
    readonly source = false,
  ) {
    super();
  }

  override toDOM() {
    const span = document.createElement("span");
    span.classList.add("sp-inserted");
    if (this.source) span.classList.add("sp-source");
    if (this.style) span.setAttribute("style", this.style);
    span.textContent = this.text;
    return span;
  }

  override eq(other: InsertedTextWidget) {
    return other.text === this.text && other.style === this.style && other.source === this.source;
  }
}
