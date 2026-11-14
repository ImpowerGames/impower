import { WidgetType } from "@codemirror/view";

export default class InsertedTextWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }

  override toDOM() {
    const span = document.createElement("span");
    span.classList.add("sp-inserted");
    span.textContent = this.text;
    return span;
  }

  override eq(other: InsertedTextWidget) {
    return other.text === this.text;
  }
}
