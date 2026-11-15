import { WidgetType } from "@codemirror/view";

export interface InsertedRowPiece {
  text: string;
  style: string;
  source: boolean;
}

const DEFAULT_LINE_HEIGHT = 22.390625;

export default class InsertedRowWidget extends WidgetType {
  constructor(readonly pieces: readonly InsertedRowPiece[]) {
    super();
  }

  override toDOM() {
    const row = document.createElement("div");
    row.classList.add("cm-line", "sp-inserted-row");
    row.style.opacity = "1";
    for (const piece of this.pieces) {
      const span = document.createElement("span");
      span.classList.add("sp-inserted");
      if (piece.source) span.classList.add("sp-source");
      if (piece.style) span.setAttribute("style", piece.style);
      span.textContent = piece.text;
      row.append(span);
    }
    return row;
  }

  override eq(other: InsertedRowWidget) {
    return (
      other.pieces.length === this.pieces.length &&
      other.pieces.every(
        (piece, index) =>
          piece.text === this.pieces[index]!.text &&
          piece.style === this.pieces[index]!.style &&
          piece.source === this.pieces[index]!.source,
      )
    );
  }

  override get estimatedHeight() {
    return DEFAULT_LINE_HEIGHT;
  }
}
