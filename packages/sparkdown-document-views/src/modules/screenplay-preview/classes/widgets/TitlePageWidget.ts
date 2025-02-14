import { EditorView } from "@codemirror/view";
import { MarkupContent } from "../../types/MarkupContent";
import getFormattedHTML from "../../utils/getFormattedHTML";
import BlockWidget from "../BlockWidget";
import { DecorationSpec } from "../../types/DecorationSpec";

export interface TitlePageSpec extends DecorationSpec {
  type: "title_page";
  tl?: MarkupContent[];
  tc?: MarkupContent[];
  tr?: MarkupContent[];
  cc?: MarkupContent[];
  bl?: MarkupContent[];
  br?: MarkupContent[];
}

export default class TitlePageWidget extends BlockWidget<TitlePageSpec> {
  override toDOM(_view: EditorView) {
    const language = this.spec.language;
    const highlighter = this.spec.highlighter;
    const container = document.createElement("div");
    container.style.pointerEvents = "none";
    const gridEl = document.createElement("div");
    gridEl.style.display = "grid";
    gridEl.style.height = "calc(96px * 9)";
    gridEl.style.gridTemplateColumns = "1fr 1fr 1fr 1fr 1fr 1fr";
    gridEl.style.gridTemplateRows = "200px 1fr 300px";
    const tlEl = document.createElement("div");
    tlEl.style.gridColumnStart = "1";
    tlEl.style.gridColumnEnd = "3";
    if (this.spec.tl) {
      tlEl.innerHTML = getFormattedHTML(this.spec.tl, language, highlighter);
    }
    gridEl.appendChild(tlEl);
    const tcEl = document.createElement("div");
    tcEl.style.gridColumnStart = "3";
    tcEl.style.gridColumnEnd = "5";
    tcEl.style.textAlign = "center";
    if (this.spec.tc) {
      tcEl.innerHTML = getFormattedHTML(this.spec.tc, language, highlighter);
    }
    gridEl.appendChild(tcEl);
    const trEl = document.createElement("div");
    trEl.style.gridColumnStart = "5";
    trEl.style.gridColumnEnd = "7";
    trEl.style.textAlign = "right";
    if (this.spec.tr) {
      trEl.innerHTML = getFormattedHTML(this.spec.tr, language, highlighter);
    }
    gridEl.appendChild(trEl);
    const ccEl = document.createElement("div");
    ccEl.style.gridColumnStart = "1";
    ccEl.style.gridColumnEnd = "7";
    ccEl.style.textAlign = "center";
    ccEl.style.alignSelf = "center";
    if (this.spec.cc) {
      ccEl.innerHTML = getFormattedHTML(this.spec.cc, language, highlighter);
    }
    gridEl.appendChild(ccEl);
    const blEl = document.createElement("div");
    blEl.style.gridColumnStart = "1";
    blEl.style.gridColumnEnd = "4";
    blEl.style.alignSelf = "end";
    if (this.spec.bl) {
      blEl.innerHTML = getFormattedHTML(this.spec.bl, language, highlighter);
    }
    gridEl.appendChild(blEl);
    const brEl = document.createElement("div");
    brEl.style.gridColumnStart = "4";
    brEl.style.gridColumnEnd = "7";
    brEl.style.textAlign = "right";
    brEl.style.alignSelf = "end";
    if (this.spec.br) {
      brEl.innerHTML = getFormattedHTML(this.spec.br, language, highlighter);
    }
    gridEl.appendChild(brEl);
    container.appendChild(gridEl);
    const pageBreakEl = document.createElement("div");
    pageBreakEl.style.borderBottom = "1px solid #00000033";
    pageBreakEl.style.height = "1em";
    pageBreakEl.style.marginTop = "1em";
    container.appendChild(pageBreakEl);
    return container;
  }
}
