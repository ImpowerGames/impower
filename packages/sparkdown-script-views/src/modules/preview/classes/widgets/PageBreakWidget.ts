import ReplaceWidget from "../ReplaceWidget";

export default class PageBreakWidget extends ReplaceWidget {
  override toDOM() {
    const container = document.createElement("div");
    container.classList.add("cm-line");
    container.style.borderBottom = "1px solid #00000033";
    return container;
  }
}
