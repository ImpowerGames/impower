import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { runOperandNameSpan } from "@impower/sparkdown/src/compiler/utils/runOperand";
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
  // file's name before its first dot, which is the part of each operand
  // renamed, so `lib/helpers.v2.luau` becomes `lib/tools.v2.luau`. Every run
  // operand of every script that names the same file, by name or by path,
  // is renamed with it, so none of them is left naming a missing file.
  if (symbol.name === "RunContent") {
    const operand = document.read(symbol.from, symbol.to);
    const oldUri = workspace.resolveRun(document.uri, operand);
    // A run operand has no reference symbols: the references above are the
    // whole operand, which the operands' own edits below replace.
    for (const uri of Object.keys(changes)) {
      delete changes[uri];
    }
    if (oldUri) {
      const folder = oldUri.slice(0, oldUri.lastIndexOf("/") + 1);
      const file = oldUri.slice(folder.length);
      const newUri = folder + newName + file.slice(file.indexOf("."));
      for (const uri of workspace.uris()) {
        const script = workspace.document(uri);
        const links = workspace.annotations(uri)?.links.iter();
        while (script && links?.value) {
          const text = script.read(links.from, links.to);
          if (workspace.resolveRun(uri, text) === oldUri) {
            const [start, end] = runOperandNameSpan(text);
            renameSymbol(uri, script.range(links.from + start, links.from + end));
          }
          links.next();
        }
      }
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
