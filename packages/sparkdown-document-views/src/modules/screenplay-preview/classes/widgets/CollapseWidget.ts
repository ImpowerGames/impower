import { EditorView } from "@codemirror/view";
import BlockWidget from "../BlockWidget";
import { CollapseSpec } from "../../types/CollapseSpec";

export default class CollapseWidget extends BlockWidget<CollapseSpec> {
  override toDOM(_view: EditorView) {
    const container = document.createElement("div");
    container.classList.add("collapse");
    container.classList.add("cm-line");
    const br = document.createElement("br");
    container.append(br);
    return container;
  }
}
