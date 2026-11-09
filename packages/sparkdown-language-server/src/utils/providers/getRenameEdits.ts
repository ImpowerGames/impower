import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { runOperandNameSpan } from "@impower/sparkdown/src/compiler/utils/runOperand";
import { type Tree } from "@lezer/common";
import {
  AnnotatedTextEdit,
  ErrorCodes,
  ResponseError,
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
import { getReferences, linkedTypes } from "./getReferences";
import { getRenameRefusal, NAME_REGEX } from "./getRenameRefusal";
import { getSymbol } from "./getSymbol";

const RUN_FILE_NAME = /^[^\s./\\"'](?:[^./\\"']*[^\s./\\"'])?$/;

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

  if (symbol.name !== "RunContent") {
    const refusal = getRenameRefusal(
      workspace,
      program,
      currentName,
      newName,
      resolvedSymbolIds,
    );
    if (refusal) {
      throw new ResponseError(ErrorCodes.InvalidRequest, refusal);
    }
  }

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
    const types = new Set<string>();
    for (const id of resolvedSymbolIds ?? []) {
      const dot = id.indexOf(".");
      if (dot > 0 && id.slice(dot + 1) === currentName) {
        const type = id.slice(0, dot);
        types.add(type);
        linkedTypes(program, type).forEach((linked) => types.add(linked));
      }
    }
    for (const type of ["image", "audio", "video", "font"]) {
      if (types.has(type)) {
        renameFileByType(type);
      }
    }
  }

  if (symbol.name === "RunContent") {
    const operand = document.read(symbol.from, symbol.to);
    const oldUri = workspace.resolveRun(document.uri, operand);
    for (const uri of Object.keys(changes)) {
      delete changes[uri];
    }
    if (oldUri) {
      const folder = oldUri.slice(0, oldUri.lastIndexOf("/") + 1);
      const file = oldUri.slice(folder.length);
      const newUri = folder + newName + file.slice(file.indexOf("."));
      const refuse = (reason: string) =>
        new ResponseError(ErrorCodes.InvalidRequest, reason);
      const invalid = `${newName || "An empty name"} is not a valid script name.`;
      if (!RUN_FILE_NAME.test(newName)) {
        throw refuse(invalid);
      }
      if (
        newUri !== oldUri &&
        (workspace.hasFile(newUri) ||
          workspace.runNameTaken(document.uri, newName, oldUri))
      ) {
        throw refuse(`${newName} is already a script in this story.`);
      }
      for (const uri of workspace.uris()) {
        const script = workspace.document(uri);
        const links = workspace.annotations(uri)?.links.iter();
        while (script && links?.value) {
          const text = script.read(links.from, links.to);
          if (workspace.resolveRun(uri, text) === oldUri) {
            if (!/^["']/.test(text.trim()) && !NAME_REGEX.test(newName)) {
              throw refuse(invalid);
            }
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
