import { EditorView } from "@codemirror/view";
import type { TitleRegion } from "../../../../../../sparkdown-screenplay/src/utils/titlePageLayout";
import { PREVIEW_FONT_SIZE } from "../../constants/PREVIEW_THEME";
import { MarkupContent } from "../../types/MarkupContent";
import getFormattedHTML from "../../utils/getFormattedHTML";
import type { PrintedTitlePage } from "../../utils/screenplayGeometry";
import BlockWidget from "../BlockWidget";
import { DecorationSpec } from "../../types/DecorationSpec";

const PAGE_BREAK_ROWS = 2;

const REGION_COLUMNS: Record<TitleRegion, { left: string; width: string; align: string }> = {
  tl: { left: "0%", width: "calc(100% / 3)", align: "left" },
  tc: { left: "calc(100% / 3)", width: "calc(100% / 3)", align: "center" },
  tr: { left: "calc(200% / 3)", width: "calc(100% / 3)", align: "right" },
  cc: { left: "0%", width: "100%", align: "center" },
  bl: { left: "0%", width: "50%", align: "left" },
  br: { left: "50%", width: "50%", align: "right" },
};

export interface TitlePageSpec extends DecorationSpec, Partial<Record<TitleRegion, MarkupContent[]>> {
  type: "title_page";
  page: PrintedTitlePage;
}

export default class TitlePageWidget extends BlockWidget<TitlePageSpec> {
  override toDOM(_view: EditorView) {
    const container = document.createElement("div");
    container.classList.add("sp-title-page");
    container.style.pointerEvents = "none";
    const frameEl = document.createElement("div");
    frameEl.style.position = "relative";
    frameEl.style.height = this.spec.page.height;
    for (const [region, column] of Object.entries(REGION_COLUMNS) as [TitleRegion, (typeof REGION_COLUMNS)[TitleRegion]][]) {
      const content = this.spec[region];
      if (!content) continue;
      const blockEl = document.createElement("div");
      blockEl.style.position = "absolute";
      blockEl.style.top = this.spec.page.tops[region];
      blockEl.style.left = column.left;
      blockEl.style.width = column.width;
      blockEl.style.display = "flex";
      blockEl.style.alignItems = "baseline";
      const baselineEl = document.createElement("span");
      baselineEl.style.flex = "none";
      baselineEl.style.height = this.spec.page.baseline;
      blockEl.appendChild(baselineEl);
      const textEl = document.createElement("div");
      textEl.style.flex = "1";
      textEl.style.minWidth = "0";
      textEl.style.textAlign = column.align;
      textEl.innerHTML = getFormattedHTML(content);
      blockEl.appendChild(textEl);
      frameEl.appendChild(blockEl);
    }
    container.appendChild(frameEl);
    const pageBreakEl = document.createElement("div");
    pageBreakEl.style.borderBottom = "1px solid #00000033";
    pageBreakEl.style.height = "1em";
    pageBreakEl.style.marginTop = "1em";
    container.appendChild(pageBreakEl);
    return container;
  }

  override get estimatedHeight(): number {
    return (this.spec.page.rows + PAGE_BREAK_ROWS) * PREVIEW_FONT_SIZE;
  }
}
