import { WidgetType } from "@codemirror/view";

export interface InsertedRowPiece {
  text: string;
  style: string;
  source: boolean;
}

export interface InsertedRowBreaks {
  before: boolean;
  after: boolean;
}

const DEFAULT_LINE_HEIGHT = 22.390625;

const lineBreak = () => {
  const br = document.createElement("br");
  br.classList.add("sp-break");
  return br;
};

export default class InsertedRowWidget extends WidgetType {
  constructor(
    readonly pieces: readonly InsertedRowPiece[],
    readonly inline?: InsertedRowBreaks,
  ) {
    super();
  }

  override toDOM() {
    const row = document.createElement(this.inline ? "span" : "div");
    row.classList.add("sp-inserted-row");
    if (!this.inline) {
      row.classList.add("cm-line");
      row.style.opacity = "1";
    }
    if (this.inline?.before) row.append(lineBreak());
    for (const piece of this.pieces) {
      const span = document.createElement("span");
      span.classList.add("sp-inserted");
      if (piece.source) span.classList.add("sp-source");
      if (piece.style) span.setAttribute("style", piece.style);
      span.textContent = piece.text;
      row.append(span);
    }
    if (this.inline?.after) row.append(lineBreak());
    return row;
  }

  override eq(other: InsertedRowWidget) {
    return (
      other.inline?.before === this.inline?.before &&
      other.inline?.after === this.inline?.after &&
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
    return this.inline ? -1 : DEFAULT_LINE_HEIGHT;
  }
}
