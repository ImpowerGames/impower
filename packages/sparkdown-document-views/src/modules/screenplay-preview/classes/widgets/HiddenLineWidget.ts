import { WidgetType } from "@codemirror/view";

export default class HiddenLineWidget extends WidgetType {
  override toDOM() {
    const hidden = document.createElement("div");
    hidden.classList.add("sp-gone");
    return hidden;
  }

  override eq() {
    return true;
  }

  override get estimatedHeight() {
    return 0;
  }
}
