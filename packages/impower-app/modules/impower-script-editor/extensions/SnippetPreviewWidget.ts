import { WidgetType } from "@codemirror/view";

export class SnippetPreviewWidget extends WidgetType {
  content: string;

  indentText: string;

  constructor(name: string, indentText: string) {
    super();
    this.content = name;
    this.indentText = indentText;
  }

  override eq(other: SnippetPreviewWidget): boolean {
    return other.content === this.content;
  }

  override toDOM(): HTMLElement {
    const wrap = document.createElement("span");
    wrap.setAttribute("aria-hidden", "true");
    const textDiv = document.createElement("span");
    textDiv.style.whiteSpace = "pre-wrap";
    textDiv.style.opacity = "0.5";
    const trimmedContent = this.content.replace(/[$#][{]|[}]/g, "");
    const indentedContent = `${trimmedContent.replace(
      /[\n]/g,
      `\n${this.indentText}`
    )}`;
    const text = document.createTextNode(indentedContent);
    textDiv.appendChild(text);
    wrap.appendChild(textDiv);
    wrap.className = "cm-quick-snippet-preview";
    return wrap;
  }
}
