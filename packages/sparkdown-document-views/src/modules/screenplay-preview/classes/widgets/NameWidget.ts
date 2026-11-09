import { EditorView } from "@codemirror/view";
import BlockWidget from "../BlockWidget";
import { NameSpec } from "../../types/NameSpec";

const DEFAULT_LINE_HEIGHT = 22.390625;

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
    container.append(name);
    return container;
  }

  override get estimatedHeight() {
    return DEFAULT_LINE_HEIGHT * (this.spec.pageBreak ? 4 : 3);
  }
}
