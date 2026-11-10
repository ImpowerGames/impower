export {
  LSPClient,
  RequestTimeoutError,
  WorkspaceMapping,
  type LSPClientConfig,
  type LSPClientExtension,
} from "./client";
export {
  applyDocumentColor,
  changeColor,
  changeColorAt,
  colorPresentationFor,
  convertFromServerColors,
  documentColorAt,
  presentColorPicker,
  serverColorDecorations,
  setDocumentColors,
  updateDocumentColors,
  type ColorPick,
  type ColorPickerPresenter,
  type DocumentColor,
} from "./color";
export {
  colorValueOf,
  colorValueOfLspColor,
  formatColorValue,
  lspColorOf,
  opacityOf,
  rgbOfLspColor,
  storyColors,
  withColorOf,
  withOpacity,
  type ColorValue,
} from "./colorValue";
export {
  completionChanges,
  completionPreview,
  serverCompletions,
  serverCompletionSource,
  type CompletionPreviewEvent,
} from "./completion";
export {
  colorContextMenuItems,
  copy,
  cut,
  defaultContextMenuItems,
  historyContextMenuItems,
  lspContextMenuItems,
  onPasteRefused,
  paste,
  pasteAvailable,
  textContextMenuItems,
  type ContextMenuItem,
} from "./context";
export {
  jumpToDeclaration,
  jumpToDefinition,
  jumpToImplementation,
  jumpToTypeDefinition,
  serverDefinitions,
} from "./definition";
export {
  serverDiagnostics,
  updateDocumentDiagnostics,
  withheldDiagnosticField,
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
export { formatDocument, serverFormatting } from "./formatting";
export { documentHighlights, serverDocumentHighlights } from "./highlights";
export { type LSPClientIcons } from "./icons";
export {
  closeHoverCards,
  hoverExpressionAt,
  hoverPreviews,
  hoverValues,
  serverHovers,
  type HoverValueSource,
} from "./hover";
export {
  INSERT_CONSTRUCTS,
  insertConstruct,
  insertConstructFromServer,
  insertContext,
  isInsertConstruct,
  planInsertion,
  branchSpansOf,
  sceneSpansOf,
  TOP_LEVEL_CONSTRUCTS,
  uniqueName,
  type EndsDialogue,
  type InsertConstruct,
  type InsertContext,
  type InsertPlan,
  type SceneSpan,
  type ScriptStructure,
} from "./insert";
export {
  convertFromServerCodeLens,
  serverCodeLenses,
  setDocumentCodeLenses,
  updateDocumentCodeLenses,
  type DocumentCodeLens,
} from "./lens";
export {
  convertFromServerDocumentLinks,
  serverDocumentLinks,
  setDocumentLinks,
  updateDocumentLinks,
  type DocumentLink,
} from "./link";
export {
  contextMenu,
  hideContextMenu,
  isContextMenuOpen,
  presentContextMenu,
  showContextMenu,
  type ContextMenuConfig,
  type ContextMenuEntry,
  type ContextMenuModel,
  type ContextMenuModelItem,
  type ContextMenuPresenter,
  type ContextMenuSpec,
} from "./menu";
export { coarsePointer } from "./pointer";
export { LSPPlugin } from "./plugin";
export {
  convertFromPosition,
  convertFromServerChangeEvents,
  convertToChangeEvents,
  convertToPosition,
} from "./pos";
export { renameSymbol, serverRenaming } from "./rename";
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
} from "./signature";
export {
  KEYS_BY_CODE,
  codeMirrorKey,
  comboKeyName,
  comboFromEvent,
  comboLabel,
  comboParts,
  isFunctionKey,
  isShortcutCombo,
  normalizeCombo,
  parseCombo,
  shortcutPlatform,
  type ShortcutCombo,
  type ShortcutPlatform,
} from "./shortcutCombo";
export {
  activeCombos,
  aliasCombos,
  assignShortcut,
  resolveShortcuts,
  restoreShortcut,
  shortcutHolder,
  shortcutForEvent,
  usualCombo,
  type ShortcutChange,
  type ShortcutCombos,
} from "./shortcutRules";
export {
  editorShortcutDispatch,
  type EditorShortcutDispatch,
} from "./shortcutDispatch";
export {
  EDITOR_SHORTCUT_COMMANDS,
  editorShortcutEntries,
  editorShortcuts,
  setEditorShortcuts,
  shortcutCombosFor,
  shortcutKeyBindings,
  shortcutLabelFor,
  type EditorShortcutEntryState,
  type EditorShortcutsConfig,
  type EditorShortcutsState,
  type ShortcutCommand,
  type ShortcutCommands,
} from "./shortcuts";
export {
  EDITOR_SHORTCUT_ROWS,
  EDITOR_SHORTCUTS,
  SHORTCUT_GROUPS,
  isShortcutRow,
  platformKeys,
  type EditorShortcutId,
  type EditorShortcutRowId,
  type FixedShortcut,
  type PlatformKeys,
  type ShortcutEntry,
  type ShortcutGroupId,
  type ShortcutPrecedence,
  type ShortcutRow,
} from "./shortcutTable";
export { serverDocumentSymbols } from "./symbols";
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
import { serverDocumentHighlights } from "./highlights";
import { serverHovers } from "./hover";
import { serverCodeLenses } from "./lens";
import { serverDocumentLinks } from "./link";
import { contextMenu } from "./menu";
import { serverRenaming } from "./rename";
import { serverSemanticHighlighting } from "./semantics";
import { serverSignatureHelp } from "./signature";
import { serverDocumentSymbols } from "./symbols";
import { serverAutoSync } from "./sync";

export function languageServerExtensions(): readonly (
  | Extension
  | LSPClientExtension
)[] {
  return [
    serverCompletions(),
    serverFolding(),
    serverColorDecorations(),
    serverDocumentLinks(),
    serverCodeLenses(),
    serverDocumentSymbols(),
    serverSemanticHighlighting(),
    serverHovers(),
    serverDocumentHighlights(),
    serverRenaming(),
    serverFormatting(),
    serverDefinitions(),
    serverSignatureHelp(),
    serverDiagnostics(),
    serverAutoSync(),
    contextMenu(),
  ];
}
export {
  editorToolCommands,
  findNextMatch,
  findPreviousMatch,
  findReferences,
  openFind,
  openProblems,
  type EditorToolCommands,
} from "./tools";
