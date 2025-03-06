import {
  TextDocument,
  Range,
  Position,
  DocumentUri,
  TextDocumentContentChangeEvent,
} from "vscode-languageserver-textdocument";

const END_NEWLINE_REGEX = /[\r\n]+$/;

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

  constructor(
    uri: DocumentUri,
    languageId: string,
    version: number,
    content: string
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

  read(from: number, to: number): string {
    return this.text.getText({
      start: this.text.positionAt(from),
      end: this.text.positionAt(to),
    });
  }

  lineAt(from: number): number {
    return this.text.positionAt(from).line;
  }

  getLineText = (line: number) => {
    const lineText = this.text.getText({
      start: {
        line: line,
        character: 0,
      },
      end: {
        line: line + 1,
        character: 0,
      },
    });
    return lineText.replace(END_NEWLINE_REGEX, "");
  };

  update(changes: TextDocumentContentChangeEvent[], version: number): void {
    this.text = TextDocument.update(this.text, changes, version);
  }
}
