import { EditorView } from "@codemirror/view";
import BlockWidget from "../BlockWidget";
import { PageBreakSpec } from "../../types/PageBreakSpec";

export const RULE_BORDER = 2;

export const RULE_GAP_ROWS = 0.5;

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
    return RULE_BORDER;
  }
}
