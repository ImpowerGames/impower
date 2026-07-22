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

const FONT_SUFFIXES = ["", "__bolditalic", "__bold_italic", "__bold", "__italic"];

/**
 * The `WorkspaceEdit` to rename a FILE `oldUri` → `newName` AND rewrite every
 * bare-name reference to it. For an asset: rewrites each `[[show image X]]` (and
 * peers) to the new name, then renames the asset file(s) (a font also moves its
 * weight siblings). For anything else: just the file rename (no reference
 * rewrites — script include-path rename is a follow-up). Text edits come BEFORE
 * the rename so the worker applies them while the script paths are still valid.
 */
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
    // 1) Rewrite every reference's bare-name token to the new name.
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

    // 2) Rename the asset file(s). A font carries its weight siblings
    //    (name__bold, …) — they all move together to the new base name.
    const suffixes = seed.type === "font" ? FONT_SUFFIXES : [""];
    for (const suffix of suffixes) {
      for (const siblingUri of workspace.findFiles(seed.name + suffix, seed.type)) {
        renameFile(siblingUri, workspace.getRenamedUri(siblingUri, newName + suffix));
      }
    }
  }

  // Always rename the file the user acted on (findFiles may miss it for a
  // type quirk, and the non-asset branch relies on this).
  renameFile(oldUri, workspace.getRenamedUri(oldUri, newName));

  // Text edits first, then the renames (the worker applies in array order).
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
