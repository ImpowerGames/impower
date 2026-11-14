import { WidgetType } from "@codemirror/view";

export default class LineBreakWidget extends WidgetType {
  override toDOM() {
    const br = document.createElement("br");
    br.classList.add("sp-break");
    return br;
  }

  override eq() {
    return true;
  }
}
