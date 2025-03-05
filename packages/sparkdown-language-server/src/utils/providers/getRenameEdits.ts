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
import { getSymbol } from "./getSymbol";
import { getReferences } from "./getReferences";
import { SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";

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

  const symbol = getSymbol(document, tree, position);
  if (!symbol) {
    return null;
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

  const currentName =
    document?.getText({
      start: document.positionAt(symbol.from),
      end: document.positionAt(symbol.to),
    }) || "";

  const renameSymbol = (uri: string, range: Range) => {
    changes[uri] ??= [];
    changes[uri].push({
      range,
      newText: newName,
    });
  };

  const renameFile = (type: string) => {
    const possibleNameSuffixes =
      type === "font"
        ? ["", "__bolditalic", "__bold_italic", "__bold", "__italic"]
        : [""];
    for (const suffix of possibleNameSuffixes) {
      for (const oldUri of documents.findFiles(currentName + suffix, type)) {
        const newUri = documents.getRenamedUri(oldUri, newName + suffix);
        documentChanges.push({
          kind: "rename",
          oldUri,
          newUri,
        });
      }
    }
  };

  const { locations, resolvedSymbolIds } = getReferences(
    document,
    tree,
    program,
    documents,
    position,
    {
      includeDeclaration: true,
      includeInterdependent: true,
    }
  );
  if (locations) {
    for (const location of locations) {
      renameSymbol(location.uri, location.range);
    }
  }

  if (documents.settings?.editor?.autoRenameFiles) {
    if (resolvedSymbolIds?.includes(`image.${currentName}`)) {
      renameFile("image");
    }
    if (resolvedSymbolIds?.includes(`audio.${currentName}`)) {
      renameFile("audio");
    }
    if (resolvedSymbolIds?.includes(`video.${currentName}`)) {
      renameFile("video");
    }
    if (resolvedSymbolIds?.includes(`font.${currentName}`)) {
      renameFile("font");
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
