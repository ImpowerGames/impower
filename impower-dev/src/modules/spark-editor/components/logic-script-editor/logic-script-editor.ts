import { LoadEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/LoadEditorMessage";
import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import {
  DidChangeTextDocumentMessage,
  DidChangeTextDocumentMethod,
  DidChangeTextDocumentParams,
} from "@impower/spark-editor-protocol/src/protocols/textDocument/DidChangeTextDocumentMessage";
import {
  DidSaveTextDocumentMessage,
  DidSaveTextDocumentMethod,
  DidSaveTextDocumentParams,
} from "@impower/spark-editor-protocol/src/protocols/textDocument/DidSaveTextDocumentMessage";
import {
  DidDeleteFilesMessage,
  DidDeleteFilesMethod,
  DidDeleteFilesParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/DidDeleteFilesMessage";
import {
  DidWriteFilesMessage,
  DidWriteFilesMethod,
  DidWriteFilesParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/DidWriteFilesMessage";
import { NotificationMessage } from "@impower/spark-editor-protocol/src/types/base/NotificationMessage";
import { Component } from "../../../../../../packages/spec-component/src/component";
import { debounce } from "../../utils/debounce";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_logic-script-editor";

const AUTOSAVE_DELAY = 200;

export default class LogicScriptEditor extends Component(spec) {
  protected _uri?: string;

  protected _version?: number;

  protected _text?: string;

  override onConnected() {
    this.loadFile();
    window.addEventListener(MessageProtocol.event, this.handleProtocol);
  }

  override onDisconnected() {
    window.removeEventListener(MessageProtocol.event, this.handleProtocol);
  }

  protected handleProtocol = (e: Event) => {
    if (e instanceof CustomEvent) {
      if (DidChangeTextDocumentMessage.type.is(e.detail)) {
        this.handleDidChangeTextDocument(e.detail);
      }
      if (DidWriteFilesMessage.type.is(e.detail)) {
        this.handleDidWriteFiles(e.detail);
      }
      if (DidDeleteFilesMessage.type.is(e.detail)) {
        this.handleDidDeleteFiles(e.detail);
      }
      if (DidSaveTextDocumentMessage.type.is(e.detail)) {
        this.handleDidSaveTextDocument(e.detail);
      }
    }
  };

  protected handleDidChangeTextDocument = async (
    message: NotificationMessage<
      DidChangeTextDocumentMethod,
      DidChangeTextDocumentParams
    >
  ) => {
    const params = message.params;
    const textDocument = params.textDocument;
    if (this._uri != null && this._uri === textDocument.uri) {
      this._version = textDocument.version;
    }
  };

  protected handleDidWriteFiles = (
    message: NotificationMessage<DidWriteFilesMethod, DidWriteFilesParams>
  ) => {
    const params = message.params;
    const remote = params.remote;
    const files = params.files;
    if (remote && files.find((f) => f.uri === this._uri)) {
      this.loadFile();
    }
  };

  protected handleDidDeleteFiles = (
    message: NotificationMessage<DidDeleteFilesMethod, DidDeleteFilesParams>
  ) => {
    const params = message.params;
    const files = params.files;
    if (files.find((f) => f.uri === this._uri)) {
      this.loadFile();
    }
  };

  protected handleDidSaveTextDocument = async (
    message: NotificationMessage<
      DidSaveTextDocumentMethod,
      DidSaveTextDocumentParams
    >
  ) => {
    const params = message.params;
    const textDocument = params.textDocument;
    const text = params.text;
    if (
      this._uri != null &&
      this._uri === textDocument.uri &&
      this._version != null
    ) {
      if (text != null) {
        this._text = text;
        this.debouncedSave();
      }
    }
  };

  protected debouncedSave = debounce(() => {
    this.save();
  }, AUTOSAVE_DELAY);

  async save() {
    if (this._uri && this._version && this._text != null) {
      await Workspace.fs.writeTextDocument({
        textDocument: {
          uri: this._uri,
          version: this._version,
          text: this._text,
        },
      });
      await Workspace.window.recordScriptChange();
    }
  }

  override onContextChanged(
    oldContext: { textPulledAt: string },
    newContext: { textPulledAt: string }
  ) {
    if (oldContext.textPulledAt !== newContext.textPulledAt) {
      this.loadFile();
    }
  }

  async loadFile() {
    const store = this.stores.workspace.current;
    const projectId = store?.project?.id;
    if (projectId) {
      const filename = this.filename || "main.sd";
      const editor = Workspace.window.getActiveEditorForFile(filename);
      if (editor) {
        const uri = editor.uri;
        const focused = editor.focused;
        const visibleRange = editor.visibleRange;
        const selectedRange = editor.selectedRange;
        const breakpointRanges = editor.breakpointRanges;
        const files = await Workspace.fs.getFiles(projectId);
        const file = files[uri];
        const text = file?.text || "";
        const version = file?.version || 0;
        const languageServerCapabilities =
          await Workspace.ls.getServerCapabilities();
        this._uri = uri;
        this._version = version;
        this.emit(
          MessageProtocol.event,
          LoadEditorMessage.type.request({
            textDocument: {
              uri,
              languageId: "sparkdown",
              version,
              text,
            },
            focused,
            visibleRange,
            selectedRange,
            breakpointRanges,
            languageServerCapabilities,
          })
        );
      } else {
      }
    }
  }

  override onInit() {
    this.updateReadonlyState();
  }

  override onStoreUpdate() {
    this.updateReadonlyState();
  }

  updateReadonlyState() {
    const store = this.stores.workspace.current;
    const syncStatus = store?.sync?.status;
    if (
      syncStatus === "syncing" ||
      syncStatus === "loading" ||
      syncStatus === "importing" ||
      syncStatus === "exporting"
    ) {
      this.ref.sparkdownScriptEditor.setAttribute("readonly", "");
    } else {
      this.ref.sparkdownScriptEditor.removeAttribute("readonly");
    }
  }
}
