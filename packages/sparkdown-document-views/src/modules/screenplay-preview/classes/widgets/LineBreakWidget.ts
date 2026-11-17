import { WidgetType } from "@codemirror/view";

export default class LineBreakWidget extends WidgetType {
  constructor(readonly counted: boolean) {
    super();
  }

  override toDOM() {
    const br = document.createElement("br");
    br.classList.add("sp-break");
    return br;
  }

  override eq(other: LineBreakWidget) {
    return other.counted === this.counted;
  }

  override get lineBreaks() {
    return this.counted ? 1 : 0;
  }
}
