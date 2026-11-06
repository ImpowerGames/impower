import { DidLoadEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/DidLoadEditorMessage";
import { SetEditorFindMatchesMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SetEditorFindMatchesMessage";
import {
  onProtocolMessage,
  sendProtocolMessage,
} from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { DidChangeTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidChangeTextDocumentMessage";
import { DidWriteFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidWriteFilesMessage";
import { debounce } from "../utils/debounce";
import { applyEditorEdit, documentChangesOf } from "./applyEditorEdit";
import type WorkspaceFileSystem from "./WorkspaceFileSystem";
import type WorkspaceLanguageServer from "./WorkspaceLanguageServer";
import type { SearchSources } from "./WorkspaceSearch";
import type { WorkspaceSettings } from "./settings/WorkspaceSettings";
import workspace from "./WorkspaceStore";
import type WorkspaceWindow from "./WorkspaceWindow";

const TEXT_CHANGE_DELAY = 300;

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
      await window.showDocument(uri, range, false, true);
    },
    setMatches: (uri, ranges) => {
      sendProtocolMessage(
        SetEditorFindMatchesMessage.type.request({
          textDocument: { uri },
          ranges,
        }),
      );
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
