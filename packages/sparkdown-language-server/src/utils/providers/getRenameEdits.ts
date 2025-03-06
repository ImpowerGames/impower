import { type Tree } from "@lezer/common";
import {
  AnnotatedTextEdit,
  type CreateFile,
  type DeleteFile,
  type Position,
  type RenameFile,
  type TextDocumentEdit,
  type WorkspaceEdit,
} from "vscode-languageserver";
import {
  Range,
  type DocumentUri,
  type TextDocument,
  type TextEdit,
} from "vscode-languageserver-textdocument";
import SparkdownTextDocuments from "../../classes/SparkdownTextDocuments";
import { getReferences } from "./getReferences";
import { SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import { getSymbol } from "./getSymbol";

export const getRenameEdits = (
  document: TextDocument | undefined,
  tree: Tree | undefined,
  program: SparkProgram | undefined,
  documents: SparkdownTextDocuments,
  newName: string,
  position: Position
): WorkspaceEdit | null | undefined => {
  if (!document || !tree) {
    return undefined;
  }

  const changes: {
    [uri: DocumentUri]: (TextEdit | AnnotatedTextEdit)[];
  } = {};
  const documentChanges: (
    | TextDocumentEdit
    | CreateFile
    | RenameFile
    | DeleteFile
  )[] = [];

  const { locations, resolvedSymbolIds } = getReferences(
    document,
    tree,
    program,
    documents,
    position,
    {
      includeDeclaration: true,
      includeInterdependent: false,
      includeLinks: true,
    }
  );

  const { symbol, nameRange } = getSymbol(document, tree, position);
  if (!symbol) {
    return null;
  }
  if (!nameRange) {
    return null;
  }

  const currentName = document?.getText(nameRange) || "";

  const renameSymbol = (uri: string, range: Range) => {
    changes[uri] ??= [];
    changes[uri].push({
      range,
      newText: newName,
    });
  };

  const renameFile = (oldUri: string, newUri: string) => {
    documentChanges.push({
      kind: "rename",
      oldUri,
      newUri,
    });
  };

  const renameFileByType = (type: string) => {
    const possibleNameSuffixes =
      type === "font"
        ? ["", "__bolditalic", "__bold_italic", "__bold", "__italic"]
        : [""];
    for (const suffix of possibleNameSuffixes) {
      for (const oldUri of documents.findFiles(currentName + suffix, type)) {
        const newUri = documents.getRenamedUri(oldUri, newName + suffix);
        renameFile(oldUri, newUri);
      }
    }
  };

  if (locations) {
    for (const location of locations) {
      renameSymbol(location.uri, location.range);
    }
  }

  if (documents.settings?.editor?.autoRenameFiles) {
    if (resolvedSymbolIds?.includes(`image.${currentName}`)) {
      renameFileByType("image");
    }
    if (resolvedSymbolIds?.includes(`audio.${currentName}`)) {
      renameFileByType("audio");
    }
    if (resolvedSymbolIds?.includes(`video.${currentName}`)) {
      renameFileByType("video");
    }
    if (resolvedSymbolIds?.includes(`font.${currentName}`)) {
      renameFileByType("font");
    }
  }

  if (symbol.name === "IncludeContent") {
    const path = document.getText({
      start: document.positionAt(symbol.from),
      end: document.positionAt(symbol.to),
    });
    const oldUri = documents.resolve(document.uri, path);
    if (oldUri) {
      const newUri = documents.getRenamedUri(oldUri, newName);
      renameSymbol(document.uri, nameRange);
      renameFile(oldUri, newUri);
    }
  }

  for (const [uri, edits] of Object.entries(changes)) {
    const document = documents.get(uri);
    if (document) {
      documentChanges.push({
        textDocument: {
          uri,
          version: document.version,
        },
        edits,
      });
    }
  }

  const result = {
    changes,
    documentChanges,
  };
  return result;
};
