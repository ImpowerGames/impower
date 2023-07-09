import { EditorView } from "@codemirror/view";
import { MarkupBlock } from "../../types/MarkupBlock";
import { ReplaceSpec } from "../../types/ReplaceSpec";
import getFormattedHTML from "../../utils/getFormattedHTML";
import ReplaceWidget from "../ReplaceWidget";

export interface SceneSpec extends ReplaceSpec {
  content?: MarkupBlock[];
}

export default class SceneWidget extends ReplaceWidget<SceneSpec> {
  override toDOM(view: EditorView) {
    const container = document.createElement("div");
    container.classList.add("cm-line");
    container.style.fontWeight = "bold";
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
