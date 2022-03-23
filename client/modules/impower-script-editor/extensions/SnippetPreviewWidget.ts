import { WidgetType } from "@codemirror/view";

export class SnippetPreviewWidget extends WidgetType {
  content: string;

  constructor(name: string) {
    super();
    this.content = name;
  }

  eq(other: SnippetPreviewWidget): boolean {
    return other.content === this.content;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.setAttribute("aria-hidden", "true");
    const textDiv = document.createElement("div");
    textDiv.style.whiteSpace = "pre-wrap";
    textDiv.style.opacity = "0.5";
    const text = document.createTextNode(
      this.content.replace(/^[\n][\n]/, "\n").replace(/[$#][{]|[}]/g, "")
    );
    textDiv.appendChild(text);
    wrap.appendChild(textDiv);
    wrap.className = "cm-quick-snippet-preview";
    return wrap;
  }
}
