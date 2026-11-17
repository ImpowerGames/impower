import { EditorView } from "@codemirror/view";
import BlockWidget from "../BlockWidget";
import { NameSpec } from "../../types/NameSpec";
import { RULE_BORDER, RULE_GAP_ROWS } from "./PageBreakWidget";

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
    const rows = this.spec.rows + (this.spec.pageBreak ? RULE_GAP_ROWS : 0);
    return rows * this.spec.row + (this.spec.pageBreak ? RULE_BORDER : 0);
  }
}
