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

/**
 * Takes a dialogue block and escapes each dialogue line with `@ :`
 * so it can be correctly syntax highlighted.
 */
const escapeDialogueLines = (block: MarkupContent[]) => {
  return block.map((c, i) =>
    i === 0
      ? // Already prefixed
        c
      : // Prefix each dialogue line so it is styled like text
        { ...c, value: "<>" + c.value },
  );
};

export interface DialogueSpec extends DecorationSpec {
  type: "dialogue";
  blocks: MarkupContent[][];
  grid: boolean;
}

export default class DialogueWidget extends BlockWidget<DialogueSpec> {
  // Populate (or repopulate) `container` with the widget's contents
  // based on the current spec. Used by both toDOM (fresh element) and
  // updateDOM (reusing the existing element).
  //
  // We blank out `style` and `innerHTML` first so updateDOM produces
  // the same attribute string as a fresh toDOM. Without the reset,
  // setting a style that already exists keeps its existing order,
  // and adding new styles (e.g. transitioning a single->dual render)
  // appends at the end — making the rendered DOM diverge from the
  // from-scratch render even when both show the same content.
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

  // Refresh the existing widget DOM in place when CodeMirror swaps an
  // old DialogueWidget instance for a new one with different content.
  // Without this method, CM's WidgetView.sync() falls through to
  // toDOM() — but only the FIRST time. After that, sync() isn't
  // triggered again for the same widget position, even when the
  // decoration set changes. Returning true from updateDOM tells CM
  // "I handled the swap; don't re-create" and is the only signal
  // that reliably keeps the widget content in sync during sequential
  // edits on large docs (where the parser catches up after the
  // initial paint but the widget DOM otherwise stays stale).
  //
  // Pairs with `block: true` on the dual-dialogue decoration in
  // screenplayFormatting.ts — only BlockWidgetView.sync() actually
  // calls updateDOM in the post-initial-render path; the inline
  // WidgetView path skips it.
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
