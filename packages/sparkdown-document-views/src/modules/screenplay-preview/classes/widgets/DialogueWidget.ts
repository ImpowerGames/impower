import { EditorView } from "@codemirror/view";
import { DecorationSpec } from "../../types/DecorationSpec";
import { MarkupContent } from "../../types/MarkupContent";
import getFormattedHTML from "../../utils/getFormattedHTML";
import BlockWidget from "../BlockWidget";

const NEWLINES_REGEX = /$/gm;
const DEFAULT_LINE_HEIGHT = 22.390625;

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
    if (this.spec.blocks.length > 1) {
      container.style.display = "grid";
      this.spec.blocks.forEach((block) => {
        const blockEl = document.createElement("div");
        blockEl.style.gridArea = "1 / 1";
        blockEl.innerHTML = getFormattedHTML(block);
        container.appendChild(blockEl);
      });
    } else {
      const standaloneBlock = this.spec.blocks[0];
      if (standaloneBlock) {
        container.innerHTML = getFormattedHTML(standaloneBlock);
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
