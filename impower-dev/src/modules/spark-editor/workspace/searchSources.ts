import { DidLoadEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/DidLoadEditorMessage";
import { SetEditorFindMatchesMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SetEditorFindMatchesMessage";
import {
  onProtocolMessage,
  sendProtocolMessage,
} from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { DidChangeTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidChangeTextDocumentMessage";
import { DidWriteFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidWriteFilesMessage";
import { layoutState, railState } from "@impower/impower-ui/layout";
import { debounce } from "../utils/debounce";
import { applyEditorEdit, documentChangesOf } from "./applyEditorEdit";
import { railReveal } from "./railWidths";
import type WorkspaceFileSystem from "./WorkspaceFileSystem";
import type WorkspaceLanguageServer from "./WorkspaceLanguageServer";
import type { SearchSources } from "./WorkspaceSearch";
import type { WorkspaceSettings } from "./settings/WorkspaceSettings";
import workspace from "./WorkspaceStore";
import type WorkspaceWindow from "./WorkspaceWindow";

const TEXT_CHANGE_DELAY = 300;

const MAIN_SCRIPT = "main.sd";

export const searchSources = (parts: {
  window: WorkspaceWindow;
  ls: WorkspaceLanguageServer;
  fs: WorkspaceFileSystem;
  settings: WorkspaceSettings;
}): SearchSources => {
  const { window, ls, fs, settings } = parts;
  const logicEditor = () => {
    void workspace.state.value;
    return window.getActiveEditorForPane("logic");
  };
  const revealScript = (uri: string) => {
    const projectId = workspace.signals.projectId.peek();
    if (!projectId) {
      return;
    }
    const filename = fs.getRelativePath(projectId, uri);
    if (filename !== MAIN_SCRIPT) {
      window.openFileEditor(filename);
      return;
    }
    const scripts = workspace.state.peek().panes.logic.panels.scripts?.activeEditor;
    if (scripts?.open && scripts.filename) {
      window.closeFileEditor(scripts.filename);
    }
  };
  return {
    openedUri: () => logicEditor()?.uri,
    selection: () => logicEditor()?.selectedRange,
    findText: (params) => ls.findText(params),
    references: (uri, position) => ls.getReferences(uri, position),
    definitions: (uri, position) => ls.getDefinitions(uri, position),
    prepareRename: (uri, position) => ls.prepareRename(uri, position),
    renameEdits: (uri, position, newName) =>
      ls.getRenameEdits(uri, position, newName),
    fileReferences: (uri) => ls.getFileReferences(uri),
    files: async () => {
      const projectId = workspace.signals.projectId.peek();
      if (!projectId) {
        return [];
      }
      return Object.values(await fs.getFiles(projectId)).map((file) => ({
        uri: file.uri,
        name: file.name,
        type: file.type,
      }));
    },
    fileText: (uri) => fs.getFileText(uri),
    applyEdit: async (edit, label) => {
      const outcome = await applyEditorEdit(fs, edit, label);
      const changes = documentChangesOf(edit);
      if (changes.some((c) => "textDocument" in c)) {
        await window.recordScriptChange();
      }
      if (changes.some((c) => "kind" in c)) {
        await window.recordAssetChange();
      }
      return outcome;
    },
    showMatch: async (uri, range) => {
      revealScript(uri);
      await window.showDocument(uri, range, false, true);
    },
    openLocation: async (uri, range) => {
      if (workspace.state.peek().pane !== "logic") {
        window.navigateTo("write");
      }
      revealScript(uri);
      await window.showDocument(uri, range, true, true);
    },
    openAsset: async (uri) => {
      const projectId = workspace.signals.projectId.peek();
      if (!projectId) {
        return;
      }
      window.navigateTo("collection");
      window.openFileEditor(fs.getRelativePath(projectId, uri));
    },
    setMatches: (uri, ranges) => {
      sendProtocolMessage(
        SetEditorFindMatchesMessage.type.request({
          textDocument: { uri },
          ranges,
        }),
      );
    },
    revealRail: () => {
      const reveal = railReveal(
        workspace.state.peek().shell,
        layoutState.current(),
        railState.current(),
      );
      if (!reveal) {
        return;
      }
      if ("railCompactWidth" in reveal) {
        window.setRailCompactWidth(reveal.railCompactWidth);
      } else {
        window.setRailWidth(reveal.railWidth);
      }
    },
    autoRenameFiles: () => settings.preferences.peek().autoRenameFiles,
    onTextChanged: (listener) => {
      const changed = debounce(listener, TEXT_CHANGE_DELAY);
      const disposers = [
        onProtocolMessage(DidChangeTextDocumentMessage.type, () => changed()),
        onProtocolMessage(DidWriteFilesMessage.type, () => changed()),
      ];
      return () => disposers.forEach((dispose) => dispose());
    },
    onEditorLoaded: (listener) =>
      onProtocolMessage(DidLoadEditorMessage.type, () => listener()),
  };
};
