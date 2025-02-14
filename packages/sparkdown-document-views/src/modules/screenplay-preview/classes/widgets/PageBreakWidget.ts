import { EditorView } from "@codemirror/view";
import BlockWidget from "../BlockWidget";
import { PageBreakSpec } from "../../types/PageBreakSpec";

const DEFAULT_LINE_HEIGHT = 22.390625;

export default class PageBreakWidget extends BlockWidget<PageBreakSpec> {
  override toDOM(_view: EditorView) {
    const container = document.createElement("div");
    container.classList.add("cm-line");
    container.style.opacity = "1";
    const hr = document.createElement("hr");
    container.append(hr);
    return container;
  }

  override get estimatedHeight() {
    return DEFAULT_LINE_HEIGHT;
  }
}
