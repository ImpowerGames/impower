import { EditorView } from "@codemirror/view";
import { MarkupBlock } from "../../types/MarkupBlock";
import { ReplaceSpec } from "../../types/ReplaceSpec";
import getFormattedHTML from "../../utils/getFormattedHTML";
import ReplaceWidget from "../ReplaceWidget";

const DIALOGUE_CONTAINER_WIDTH = "60%";
const DUAL_DIALOGUE_CONTAINER_WIDTH = "95%";
const DUAL_DIALOGUE_BLOCK_WIDTH = "100%";

export interface DialogueSpec extends ReplaceSpec {
  content?: MarkupBlock[];
  left?: MarkupBlock[];
  right?: MarkupBlock[];
}

export default class DialogueWidget extends ReplaceWidget<DialogueSpec> {
  override toDOM(view: EditorView) {
    const container = document.createElement("div");
    container.classList.add("cm-line");
    container.style.marginLeft = "auto";
    container.style.marginRight = "auto";
    if (this.spec.content) {
      container.style.width = DIALOGUE_CONTAINER_WIDTH;
      container.innerHTML = getFormattedHTML(
        this.spec.content,
        this.spec.language,
        this.spec.highlighter
      );
    } else if (this.spec.left || this.spec.right) {
      container.style.width = DUAL_DIALOGUE_CONTAINER_WIDTH;
      container.style.display = "flex";
      container.style.flexDirection = "row";
      container.style.justifyContent = "space-between";
      if (this.spec.left) {
        const leftEl = document.createElement("div");
        leftEl.classList.add("cm-block-left");
        leftEl.style.width = DUAL_DIALOGUE_BLOCK_WIDTH;
        leftEl.innerHTML = getFormattedHTML(
          this.spec.left,
          this.spec.language,
          this.spec.highlighter
        );
        container.appendChild(leftEl);
      }
      if (this.spec.right) {
        const rightEl = document.createElement("div");
        rightEl.classList.add("cm-block-right");
        rightEl.style.width = DUAL_DIALOGUE_BLOCK_WIDTH;
        rightEl.innerHTML = getFormattedHTML(
          this.spec.right,
          this.spec.language,
          this.spec.highlighter
        );
        container.appendChild(rightEl);
      }
    }
    view.requestMeasure();
    return container;
  }
}
