import { MarkupBlock } from "../../types/MarkupBlock";
import { ReplaceSpec } from "../../types/ReplaceSpec";
import getFormattedHTML from "../../utils/getFormattedHTML";
import ReplaceWidget from "../ReplaceWidget";

export interface DialogueSpec extends ReplaceSpec {
  content?: MarkupBlock[];
  left?: MarkupBlock[];
  right?: MarkupBlock[];
}

export default class DialogueWidget extends ReplaceWidget<DialogueSpec> {
  override toDOM() {
    const container = document.createElement("div");
    container.classList.add("cm-line");
    container.style.marginLeft = "auto";
    container.style.marginRight = "auto";
    if (this.spec.content) {
      container.style.width = "68%";
      container.innerHTML = getFormattedHTML(
        this.spec.content,
        this.spec.language,
        this.spec.highlighter
      );
    } else if (this.spec.left || this.spec.right) {
      container.style.width = "95%";
      container.style.display = "flex";
      container.style.flexDirection = "row";
      container.style.justifyContent = "space-between";
      if (this.spec.left) {
        const leftEl = document.createElement("div");
        leftEl.classList.add("cm-block-left");
        leftEl.style.width = "45%";
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
        rightEl.style.width = "45%";
        rightEl.innerHTML = getFormattedHTML(
          this.spec.right,
          this.spec.language,
          this.spec.highlighter
        );
        container.appendChild(rightEl);
      }
    }
    return container;
  }
}
