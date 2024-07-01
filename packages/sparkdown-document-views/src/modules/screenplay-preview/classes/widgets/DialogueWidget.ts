import { EditorView } from "@codemirror/view";
import { MarkupContent } from "../../types/MarkupContent";
import { ReplaceSpec } from "../../types/ReplaceSpec";
import getFormattedHTML from "../../utils/getFormattedHTML";
import ReplaceWidget from "../ReplaceWidget";

const DIALOGUE_CONTAINER_WIDTH = "60%";
const DUAL_DIALOGUE_CONTAINER_WIDTH = "95%";
const DUAL_DIALOGUE_BLOCK_WIDTH = "100%";

/**
 * Takes a dialogue block and escapes each dialogue line with `@ :`
 * so it can be correctly syntax highlighted.
 */
const escapeDialogueLines = (block: MarkupContent[]) => {
  return block.map((c, i) =>
    i === 0
      ? // Already prefixed with @
        c
      : // Prefix each dialogue line with `@ :`
        { ...c, value: "@ :" + c.value }
  );
};

export interface DialogueSpec extends ReplaceSpec {
  blocks: MarkupContent[][];
  grid: boolean;
}

export default class DialogueWidget extends ReplaceWidget<DialogueSpec> {
  override toDOM(view: EditorView) {
    const container = document.createElement("div");
    container.classList.add("cm-line");
    container.style.marginLeft = "auto";
    container.style.marginRight = "auto";
    if (this.spec.blocks.length > 1) {
      container.style.width = DUAL_DIALOGUE_CONTAINER_WIDTH;
      container.style.display = "grid";
      container.style.gap = "8px";
      container.style.gridTemplateColumns = "1fr 1fr";
      this.spec.blocks.forEach((block) => {
        const blockEl = document.createElement("div");
        blockEl.style.width = DUAL_DIALOGUE_BLOCK_WIDTH;
        blockEl.innerHTML = getFormattedHTML(
          escapeDialogueLines(block),
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
          escapeDialogueLines(standaloneBlock),
          this.spec.language,
          this.spec.highlighter
        );
      }
    }
    view.requestMeasure();
    return container;
  }
}
