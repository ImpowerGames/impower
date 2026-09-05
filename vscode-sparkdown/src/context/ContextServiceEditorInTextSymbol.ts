import { ExtensionContext, Position, TextDocument } from "vscode";
import { type SparkdownNodeName } from "../../../packages/sparkdown/src/compiler/types/SparkdownNodeName";
import { getSymbol } from "../../../packages/sparkdown-language-server/src/utils/providers/getSymbol";

// The in-text symbol names this context key reports.
const IN_TEXT_SYMBOLS: SparkdownNodeName[] = [
  "Space",
  "Word",
  "EmDash",
  "Punctuation",
];
import { SparkdownDocumentManager } from "../managers/SparkdownDocumentManager";
import { AbsContextService } from "./IContextService";

export class ContextServiceEditorInTextSymbol extends AbsContextService {
  public contextName: string = "sparkdown.extension.editor.cursor.inTextSymbol";

  public onActivate(_context: ExtensionContext) {
    // set initial state of context
    this.setState("");
  }

  public dispose(): void {}

  public onDidChangeActiveTextEditor(
    document: TextDocument,
    cursorPos: Position,
  ) {
    this.updateContextState(document, cursorPos);
  }

  public onDidChangeTextEditorSelection(
    document: TextDocument,
    cursorPos: Position,
  ) {
    this.updateContextState(document, cursorPos);
  }

  private updateContextState(
    document: TextDocument,
    cursorPos: Position,
  ): string {
    const parsedDoc = SparkdownDocumentManager.instance.get(document.uri);
    const tree = SparkdownDocumentManager.instance.tree(document.uri);
    const symbol = getSymbol(parsedDoc, tree, cursorPos);
    const symbolName = symbol.symbol?.name;
    if (symbolName && IN_TEXT_SYMBOLS.includes(symbolName)) {
      this.setState(symbolName);
      return symbolName;
    } else {
      this.setState("");
      return "";
    }
  }
}
