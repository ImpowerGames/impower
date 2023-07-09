import { EditorView } from "@codemirror/view";
import { MarkupBlock } from "../../types/MarkupBlock";
import { ReplaceSpec } from "../../types/ReplaceSpec";
import getFormattedHTML from "../../utils/getFormattedHTML";
import ReplaceWidget from "../ReplaceWidget";

export interface TransitionSpec extends ReplaceSpec {
  content?: MarkupBlock[];
}

export default class TransitionWidget extends ReplaceWidget<TransitionSpec> {
  override toDOM(view: EditorView) {
    const container = document.createElement("div");
    container.classList.add("cm-line");
    container.style.textAlign = "right";
    if (this.spec.content) {
      container.innerHTML = getFormattedHTML(
        this.spec.content,
        this.spec.language,
        this.spec.highlighter
      );
    }
    view.requestMeasure();
    return container;
  }
}
