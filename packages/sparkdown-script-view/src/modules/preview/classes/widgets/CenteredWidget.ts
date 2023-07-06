import { MarkupBlock } from "../../types/MarkupBlock";
import { ReplaceSpec } from "../../types/ReplaceSpec";
import getFormattedHTML from "../../utils/getFormattedHTML";
import ReplaceWidget from "../ReplaceWidget";

export interface CenteredSpec extends ReplaceSpec {
  content: MarkupBlock[];
}

export default class CenteredWidget extends ReplaceWidget<CenteredSpec> {
  toDOM() {
    const container = document.createElement("div");
    container.classList.add("cm-line");
    container.style.textAlign = "center";
    if (this.spec.content) {
      container.innerHTML = getFormattedHTML(
        this.spec.content,
        this.spec.language,
        this.spec.highlighter
      );
    }
    return container;
  }
}
