export {
  LSPClient,
  WorkspaceMapping,
  type LSPClientConfig,
  type LSPClientExtension,
} from "./client";
export {
  convertFromServerColors,
  serverColorDecorations,
  setDocumentColors,
  updateDocumentColors,
  type DocumentColor,
} from "./color";
export { serverCompletions, serverCompletionSource } from "./completion";
export {
  jumpToDeclaration,
  jumpToDefinition,
  jumpToDefinitionKeymap,
  jumpToImplementation,
  jumpToTypeDefinition,
  serverDefinitions,
} from "./definition";
export {
  convertFromServerDiagnostics,
  serverDiagnostics,
  updateDocumentDiagnostics,
} from "./diagnostics";
export {
  convertFromServerFoldingRanges,
  foldingChanged,
  foldingMarkerDOM,
  foldingPlaceholderDOM,
  serverFolding,
  setDocumentFoldingRanges,
  updateDocumentFoldingRanges,
  type DocumentFoldingRange,
} from "./folding";
export { formatDocument, formatKeymap, serverFormatting } from "./formatting";
export { serverHovers } from "./hover";
export {
  convertFromServerDocumentLinks,
  serverDocumentLinks,
  setDocumentLinks,
  updateDocumentLinks,
  type DocumentLink,
} from "./link";
export { contextMenu } from "./menu";
export { LSPPlugin } from "./plugin";
export {
  convertFromPosition,
  convertFromServerChangeEvents,
  convertToChangeEvents,
  convertToPosition,
} from "./pos";
export {
  closeReferencePanel,
  findReferences,
  findReferencesKeymap,
  forEachReference,
  isReferencePanelOpen,
  serverReferences,
  type ReferenceLocation,
} from "./references";
export { renameKeymap, renameSymbol, serverRenaming } from "./rename";
export {
  convertFromServerSemanticTokens,
  serverSemanticHighlighting,
  setDocumentSemanticHighlighting,
  updateDocumentSemanticHighlighting,
  type DocumentSemanticToken,
  type ServerSemanticHighlightingConfig,
} from "./semantics";
export {
  nextSignature,
  prevSignature,
  serverSignatureHelp,
  showSignatureHelp,
  signatureKeymap,
} from "./signature";
export { serverAutoSync } from "./sync";
export { BrowserTransport, WorkerTransport, type Transport } from "./transport";
export { getDocumentVersion, versionConfig, versioning } from "./version";
export { Workspace, type WorkspaceFile } from "./workspace";

import { Extension } from "@codemirror/state";
import { LSPClientExtension } from "./client";
import { serverColorDecorations } from "./color";
import { serverCompletions } from "./completion";
import { serverDefinitions } from "./definition";
import { serverDiagnostics } from "./diagnostics";
import { serverFolding } from "./folding";
import { serverFormatting } from "./formatting";
import { serverHovers } from "./hover";
import { serverDocumentLinks } from "./link";
import { contextMenu } from "./menu";
import { serverReferences } from "./references";
import { serverRenaming } from "./rename";
import { serverSemanticHighlighting } from "./semantics";
import { serverSignatureHelp } from "./signature";
import { serverAutoSync } from "./sync";

/// This function bundles all the extensions defined in this package,
/// in a way that can be passed to the
/// [`extensions`](#lsp-client.LSPClientConfig.extensions) option to
/// `LSPClient`.
export function languageServerExtensions(): readonly (
  | Extension
  | LSPClientExtension
)[] {
  return [
    serverCompletions(),
    serverFolding(),
    serverColorDecorations(),
    serverDocumentLinks(),
    serverSemanticHighlighting(),
    serverHovers(),
    serverRenaming(),
    serverReferences(),
    serverFormatting(),
    serverDefinitions(),
    serverSignatureHelp(),
    serverDiagnostics(),
    serverAutoSync(),
    contextMenu(),
  ];
}
