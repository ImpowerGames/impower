import {
  type DocumentUri,
  type Position,
  type Range,
  TextDocument,
  type TextDocumentContentChangeEvent,
} from "vscode-languageserver-textdocument";

export class SparkdownDocument implements TextDocument {
  text: TextDocument;

  get uri() {
    return this.text.uri;
  }

  get languageId() {
    return this.text.languageId;
  }

  get version() {
    return this.text.version;
  }

  get lineCount() {
    return this.text.lineCount;
  }

  get length() {
    return this.cachedText.length;
  }

  lineChunks = false;

  protected _cachedText?: string;

  protected get cachedText(): string {
    this._cachedText ??= this.text.getText();
    return this._cachedText;
  }

  constructor(
    uri: DocumentUri,
    languageId: string,
    version: number,
    content: string,
  ) {
    this.text = TextDocument.create(uri, languageId, version, content);
  }

  clone(): SparkdownDocument {
    const copy = new SparkdownDocument(
      this.uri,
      this.languageId,
      this.version,
      this.getText(),
    );
    const lineOffsets = (this.text as { _lineOffsets?: number[] })
      ._lineOffsets;
    if (lineOffsets) {
      (copy.text as { _lineOffsets?: number[] })._lineOffsets =
        lineOffsets.slice();
    }
    copy._cachedText = this._cachedText;
    return copy;
  }

  getText(range?: Range): string {
    return this.text.getText(range);
  }

  positionAt(offset: number): Position {
    return this.text.positionAt(offset);
  }

  offsetAt(position: Position): number {
    return this.text.offsetAt(position);
  }

  range(from: number, to?: number): Range {
    return {
      start: this.text.positionAt(from),
      end: this.text.positionAt(
        to ?? this.text.offsetAt(this.text.positionAt(Number.MAX_VALUE)),
      ),
    };
  }

  read(from: number, to: number): string {
    return this.cachedText.slice(from, to);
  }

  lineAt(from: number): number {
    return this.text.positionAt(from).line;
  }

  getLineText = (line: number) => {
    const lineFrom = this.text.offsetAt({
      line: line,
      character: 0,
    });
    const lineText = this.lineChunk(lineFrom);
    if (lineText === "\r\n" || lineText === "\r" || lineText === "\n") {
      return "";
    }
    return lineText;
  };

  lineChunk(from: number): string {
    const start = this.text.positionAt(from);
    const end = { line: start.line + 1, character: 0 };
    const line = this.text.getText({ start, end });
    if (line === "\r\n" || line === "\r" || line === "\n") {
      return line;
    }
    if (line.endsWith("\r\n")) {
      return line.slice(0, -2);
    }
    if (line.endsWith("\r") || line.endsWith("\n")) {
      return line.slice(0, -1);
    }
    return line;
  }

  getLineRange = (line: number): Range => {
    const lineTo = Math.max(
      this.text.offsetAt({
        line: line + 1,
        character: 0,
      }) - 1,
      0,
    );
    return {
      start: {
        line: line,
        character: 0,
      },
      end: this.positionAt(lineTo),
    };
  };

  update(changes: TextDocumentContentChangeEvent[], version: number): void {
    this.text = TextDocument.update(this.text, changes, version);
    this._cachedText = undefined;
  }

  static readonly CHUNK_TARGET_SIZE = 16384;

  chunk(from: number): string {
    const text = this.cachedText;
    if (from >= text.length) {
      return "";
    }
    const size = SparkdownDocument.CHUNK_TARGET_SIZE;
    const lineEndAfter = (pos: number) => {
      const newline = text.indexOf("\n", pos);
      return newline === -1 ? text.length : newline + 1;
    };
    const multiple = Math.floor(from / size) * size;
    let end = multiple > 0 ? lineEndAfter(multiple) : 0;
    if (end <= from) {
      end = lineEndAfter(multiple + size);
    }
    return text.slice(from, end);
  }
}
