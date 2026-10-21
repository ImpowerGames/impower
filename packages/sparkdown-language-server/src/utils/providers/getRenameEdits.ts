import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
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
  type TextEdit,
} from "vscode-languageserver-textdocument";
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";
import { SparkdownConfiguration } from "../../types/SparkdownConfiguration";
import { getReferences } from "./getReferences";
import { getSymbol } from "./getSymbol";

export const getRenameEdits = (
  settings: SparkdownConfiguration | undefined,
  document: SparkdownDocument | undefined,
  tree: Tree | undefined,
  program: SparkProgram | undefined,
  workspace: SparkdownLanguageServerWorkspace,
  newName: string,
  position: Position,
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

  const { references, resolvedSymbolIds } = getReferences(
    document,
    tree,
    program,
    workspace,
    position,
    {
      searchOtherFiles: true,
      includeDeclaration: true,
      includeInterdependent: false,
      includeLinks: true,
    },
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
      for (const oldUri of workspace.findFiles(currentName + suffix, type)) {
        const newUri = workspace.getRenamedUri(oldUri, newName + suffix);
        renameFile(oldUri, newUri);
      }
    }
  };

  if (references) {
    for (const reference of references) {
      renameSymbol(reference.uri, reference.range);
    }
  }

  if (settings?.editor?.autoRenameFiles) {
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

  // A `run` operand renames the `.luau` file it names with it (#1389): the
  // file's name before its first dot, which is the part of the operand
  // renamed, so `lib/helpers.v2.luau` becomes `lib/tools.v2.luau`.
  if (symbol.name === "RunContent") {
    const operand = document.read(symbol.from, symbol.to);
    const oldUri = workspace.resolveRun(document.uri, operand);
    if (oldUri) {
      const folder = oldUri.slice(0, oldUri.lastIndexOf("/") + 1);
      const file = oldUri.slice(folder.length);
      const newUri = folder + newName + file.slice(file.indexOf("."));
      // The references above can already hold the operand's name.
      const edits = changes[document.uri] ?? [];
      const at = document.offsetAt(nameRange.start);
      changes[document.uri] = edits.filter(
        (edit) => document.offsetAt(edit.range.end) <= at ||
          document.offsetAt(edit.range.start) >= document.offsetAt(nameRange.end),
      );
      renameSymbol(document.uri, nameRange);
      renameFile(oldUri, newUri);
    }
  }

  for (const [uri, edits] of Object.entries(changes)) {
    const document = workspace.document(uri);
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
