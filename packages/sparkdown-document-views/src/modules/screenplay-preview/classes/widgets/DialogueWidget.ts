import { EditorView } from "@codemirror/view";
import { DecorationSpec } from "../../types/DecorationSpec";
import { MarkupContent } from "../../types/MarkupContent";
import getFormattedHTML from "../../utils/getFormattedHTML";
import BlockWidget from "../BlockWidget";

const DIALOGUE_CONTAINER_WIDTH = "100%";
const DUAL_DIALOGUE_CONTAINER_WIDTH = "95%";
const DUAL_DIALOGUE_BLOCK_WIDTH = "100%";
const NEWLINES_REGEX = /$/gm;
const DEFAULT_LINE_HEIGHT = 22.390625;

const escapeDialogueLines = (block: MarkupContent[]) => {
  return block.map((c, i) =>
    i === 0
      ?
        c
      :
        { ...c, value: "<>" + c.value },
  );
};

export interface DialogueSpec extends DecorationSpec {
  type: "dialogue";
  blocks: MarkupContent[][];
  grid: boolean;
}

export default class DialogueWidget extends BlockWidget<DialogueSpec> {
  renderInto(container: HTMLElement) {
    container.removeAttribute("style");
    container.innerHTML = "";
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
          this.spec.highlighter,
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
          this.spec.highlighter,
        );
      }
    }
  }

  override toDOM(_view: EditorView) {
    const container = document.createElement("div");
    this.renderInto(container);
    return container;
  }

  override updateDOM(dom: HTMLElement, _view: EditorView): boolean {
    this.renderInto(dom);
    return true;
  }

  getEstimatedLineCount(block: MarkupContent[]) {
    let lineCount = 0;
    for (const line of block) {
      lineCount += line.value?.match(NEWLINES_REGEX)?.length ?? 0;
    }
    return lineCount;
  }

  override get estimatedHeight(): number {
    let lineCount = 0;
    for (const block of this.spec.blocks) {
      lineCount += this.getEstimatedLineCount(block);
    }
    return lineCount * DEFAULT_LINE_HEIGHT;
  }
}
