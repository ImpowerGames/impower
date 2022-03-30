import { Decoration, WidgetType } from "@codemirror/view";

// widget are used for space only lines when we need to fill
// the indentation guides on parts of the line that don't exist
export class IndentationWidget extends WidgetType {
  constructor(readonly indents: number[]) {
    super();
  }

  static create(indents: number[]): Decoration {
    return Decoration.widget({
      widget: new IndentationWidget(indents),
      side: 1,
    });
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = "cm-indentation-widget";
    this.indents.forEach((indent) => {
      const marker = wrap.appendChild(document.createElement("span"));
      marker.className = "cm-indentation-guide";
      marker.textContent = " ".repeat(indent);
    });
    return wrap;
  }
}
