import { EditorView, Rect } from "@codemirror/view";
import { MarkupContent } from "../../types/MarkupContent";
import getFormattedHTML from "../../utils/getFormattedHTML";
import BlockWidget from "../BlockWidget";
import { DecorationSpec } from "../../types/DecorationSpec";

const DIALOGUE_CONTAINER_WIDTH = "100%";
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

export interface DialogueSpec extends DecorationSpec {
  type: "dialogue";
  blocks: MarkupContent[][];
  grid: boolean;
}

export default class DialogueWidget extends BlockWidget<DialogueSpec> {
  override toDOM(_view: EditorView) {
    const container = document.createElement("div");
    container.style.pointerEvents = "none";
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
    return container;
  }
}
