import { EditorView } from "@codemirror/view";
import BlockWidget from "../BlockWidget";
import { NameSpec } from "../../types/NameSpec";
import { RULE_BORDER } from "./PageBreakWidget";

export default class NameWidget extends BlockWidget<NameSpec> {
  override toDOM(_view: EditorView) {
    const container = document.createElement("div");
    container.classList.add("cm-line");
    container.style.opacity = "1";
    if (this.spec.pageBreak) {
      container.append(document.createElement("hr"));
    }
    const name = document.createElement("p");
    name.classList.add("sp-name");
    name.textContent = this.spec.name;
    if (this.spec.style) name.setAttribute("style", this.spec.style);
    container.append(name);
    return container;
  }

  override get estimatedHeight() {
    return this.spec.rows * this.spec.row + (this.spec.pageBreak ? RULE_BORDER : 0);
  }
}
