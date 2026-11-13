import { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import {
  type CreateFile,
  type DeleteFile,
  type RenameFile,
  type TextDocumentEdit,
  type TextEdit,
  type WorkspaceEdit,
} from "vscode-languageserver";
import { type DocumentUri } from "vscode-languageserver-textdocument";
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";
import { getFileSymbol } from "./getFileSymbol";
import { collectReferencesForTarget } from "./getReferences";

export const getFileRenameEdits = (
  workspace: SparkdownLanguageServerWorkspace,
  program: SparkProgram | undefined,
  oldUri: string,
  newName: string,
): WorkspaceEdit => {
  const changes: { [uri: DocumentUri]: TextEdit[] } = {};
  const renames: RenameFile[] = [];

  const renameFile = (from: string, to: string) => {
    if (from !== to && !renames.some((r) => r.oldUri === from)) {
      renames.push({ kind: "rename", oldUri: from, newUri: to });
    }
  };

  const seed = getFileSymbol(workspace, oldUri);

  if (seed) {
    const { references } = collectReferencesForTarget(
      program,
      workspace,
      { symbolName: seed.name, symbolIds: seed.symbolIds },
      {
        searchOtherFiles: true,
        includeDeclaration: true,
        includeInterdependent: false,
        includeLinks: true,
        addAssetFiles: false,
      },
    );
    for (const reference of references) {
      changes[reference.uri] ??= [];
      changes[reference.uri]!.push({ range: reference.range, newText: newName });
    }

    if (seed.type === "font") {
      for (const { uri, suffix } of workspace.findFontFamilyFiles(seed.name)) {
        renameFile(uri, workspace.getRenamedUri(uri, newName + suffix));
      }
    } else {
      for (const siblingUri of workspace.findFiles(seed.name, seed.type)) {
        renameFile(siblingUri, workspace.getRenamedUri(siblingUri, newName));
      }
    }
  }

  renameFile(oldUri, workspace.getRenamedUri(oldUri, newName));

  const documentChanges: (
    | TextDocumentEdit
    | CreateFile
    | RenameFile
    | DeleteFile
  )[] = [];
  for (const [uri, edits] of Object.entries(changes)) {
    const document = workspace.document(uri);
    if (document) {
      documentChanges.push({
        textDocument: { uri, version: document.version },
        edits,
      });
    }
  }
  documentChanges.push(...renames);

  return { changes, documentChanges };
};
