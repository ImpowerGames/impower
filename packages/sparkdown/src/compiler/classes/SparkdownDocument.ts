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

  // chunk() serves multi-line, line-aligned slices, not single lines.
  lineChunks = false;

  /**
   * The parser reads the document through `chunk()`/`read()`/`length` many
   * thousands of times per parse; computing each read through positionAt's
   * binary search almost doubled full-parse time on large documents. Cache the
   * flat text and serve reads from it (invalidated on `update()`).
   */
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

  /**
   * One line starting at `from`, without its trailing newline -- unless `from`
   * sits on a bare newline, which is returned as-is. (The pre-slice `chunk()`
   * semantics, kept for line-oriented callers.)
   */
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

  /**
   * Target size for `chunk()` slices. Large enough that a full parse only
   * needs a handful of chunk calls (serving one LINE per call cost +86% on a
   * 207KB document); bounded so an incremental resume doesn't pull the whole
   * remaining document into the tokenizer's string window.
   */
  static readonly CHUNK_TARGET_SIZE = 16384;

  chunk(from: number): string {
    const text = this.cachedText;
    if (from >= text.length) {
      return "";
    }
    let end = from + SparkdownDocument.CHUNK_TARGET_SIZE;
    if (end >= text.length) {
      return text.slice(from);
    }
    // Extend to the end of the line containing `end` so slices always break
    // right after a newline (the tokenizer's window loop expects that).
    const newline = text.indexOf("\n", end);
    end = newline === -1 ? text.length : newline + 1;
    return text.slice(from, end);
  }
}
