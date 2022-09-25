import * as vscode from "vscode";
import { getRuntimeString, StructureItem } from "../../../sparkdown";
import { editorState } from "../state/editorState";

export class SparkdownSymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(
    document: vscode.TextDocument
  ): vscode.DocumentSymbol[] {
    const symbols: vscode.DocumentSymbol[] = [];
    let sceneCounter = 0;

    //hierarchyEnd is the last line of the token's hierarchy. Last line of document for the root, last line of current section, etc...
    const symbolFromStruct = (
      token: StructureItem,
      nextToken: StructureItem,
      hierarchyEnd: number
    ): { symbol: vscode.DocumentSymbol; length: number } => {
      let length = 0;
      const start: {
        line: number;
        character: number;
      } = token.range.start;
      let end: {
        line: number;
        character: number;
      } = document.lineAt(hierarchyEnd - 1).range.end;
      let details = undefined;
      if (hierarchyEnd === start.line) {
        end = document.lineAt(hierarchyEnd).range.end;
      }
      if (nextToken !== undefined) {
        end = nextToken.range.start;
      }
      if (token.type !== "section") {
        const scene =
          editorState.parsedDocuments[document.uri.toString()].properties
            ?.scenes?.[sceneCounter];
        const sceneLength =
          (scene?.actionDuration || 0) + (scene?.dialogueDuration || 0);
        details = getRuntimeString(sceneLength);
        length = sceneLength;
        sceneCounter++;
      }
      let symbolName = " ";
      if (token.text !== "") {
        symbolName = token.text;
      }
      const range = new vscode.Range(
        new vscode.Position(start.line, start.character),
        new vscode.Position(end.line, end.character)
      );
      const selectionRange = new vscode.Range(
        new vscode.Position(
          token.range.start.line,
          token.range.start.character
        ),
        new vscode.Position(token.range.end.line, token.range.end.character)
      );
      const symbol = new vscode.DocumentSymbol(
        symbolName,
        details || "",
        vscode.SymbolKind.String,
        range,
        selectionRange
      );
      symbol.children = [];

      let childrenLength = 0;
      if (token.children) {
        for (let index = 0; index < token.children.length; index++) {
          const childSymbol = symbolFromStruct(
            token.children[index],
            token.children[index + 1],
            end.line
          );
          symbol.children.push(childSymbol.symbol);
          childrenLength += childSymbol.length;
        }
      }
      if (token.type === "section") {
        length = childrenLength;
        symbol.detail = getRuntimeString(childrenLength);
      }
      return { symbol, length };
    };

    const doc = editorState.parsedDocuments[document.uri.toString()];
    const structure = doc.properties?.structure || [];
    for (let index = 0; index < structure.length; index++) {
      symbols.push(
        symbolFromStruct(
          structure[index],
          structure[index + 1],
          document.lineCount
        ).symbol
      );
    }
    return symbols;
  }
}
