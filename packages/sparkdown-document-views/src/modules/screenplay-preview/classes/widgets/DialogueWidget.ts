import { EditorView } from "@codemirror/view";
import { MarkupContent } from "../../types/MarkupContent";
import { ReplaceSpec } from "../../types/ReplaceSpec";
import getFormattedHTML from "../../utils/getFormattedHTML";
import ReplaceWidget from "../ReplaceWidget";

const DIALOGUE_CONTAINER_WIDTH = "60%";
const DUAL_DIALOGUE_CONTAINER_WIDTH = "95%";
const DUAL_DIALOGUE_BLOCK_WIDTH = "100%";

export interface DialogueSpec extends ReplaceSpec {
  blocks: MarkupContent[][];
  dual: boolean;
}

export default class DialogueWidget extends ReplaceWidget<DialogueSpec> {
  override toDOM(view: EditorView) {
    const container = document.createElement("div");
    container.classList.add("cm-line");
    container.style.marginLeft = "auto";
    container.style.marginRight = "auto";
    if (this.spec.dual) {
      container.style.width = DUAL_DIALOGUE_CONTAINER_WIDTH;
      container.style.display = "grid";
      container.style.gap = "8px";
      container.style.gridTemplateColumns = "1fr 1fr";
      this.spec.blocks.forEach((block) => {
        const blockEl = document.createElement("div");
        blockEl.style.width = DUAL_DIALOGUE_BLOCK_WIDTH;
        blockEl.innerHTML = getFormattedHTML(
          block,
          this.spec.language,
          this.spec.highlighter
        );
        container.appendChild(blockEl);
      });
    } else {
      const standaloneBlock = this.spec.blocks[0];
      if (standaloneBlock) {
        container.style.width = DIALOGUE_CONTAINER_WIDTH;
        container.innerHTML = getFormattedHTML(
          standaloneBlock,
          this.spec.language,
          this.spec.highlighter
        );
      }
    }
    view.requestMeasure();
    return container;
  }
}
