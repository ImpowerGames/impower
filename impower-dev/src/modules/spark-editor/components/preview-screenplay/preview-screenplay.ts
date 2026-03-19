import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { LoadPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/LoadPreviewMessage";
import {
  DidOpenTextDocumentMessage,
  DidOpenTextDocumentMethod,
  DidOpenTextDocumentParams,
} from "@impower/spark-editor-protocol/src/protocols/textDocument/DidOpenTextDocumentMessage";
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
import { Workspace } from "../../workspace/Workspace";
import spec from "./_preview-screenplay";

export default class PreviewScreenplay extends Component(spec) {
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
      if (DidOpenTextDocumentMessage.type.is(e.detail)) {
        this.handleDidOpenTextDocument(e.detail);
      }
      if (DidWriteFilesMessage.type.is(e.detail)) {
        this.handleDidWriteFiles(e.detail);
      }
      if (DidDeleteFilesMessage.type.is(e.detail)) {
        this.handleDidDeleteFiles(e.detail);
      }
    }
  };

  protected handleDidOpenTextDocument = (
    message: NotificationMessage<
      DidOpenTextDocumentMethod,
      DidOpenTextDocumentParams
    >,
  ) => {
    this.loadFile();
  };

  protected handleDidWriteFiles = (
    message: NotificationMessage<DidWriteFilesMethod, DidWriteFilesParams>,
  ) => {
    const params = message.params;
    const remote = params.remote;
    const files = params.files;
    const editor = Workspace.window.getActiveEditorForPane("logic");
    if (remote && files.find((f) => f.uri === editor?.uri)) {
      this.loadFile();
    }
  };

  protected handleDidDeleteFiles = (
    message: NotificationMessage<DidDeleteFilesMethod, DidDeleteFilesParams>,
  ) => {
    const params = message.params;
    const files = params.files;
    const editor = Workspace.window.getActiveEditorForPane("logic");
    if (files.find((f) => f.uri === editor?.uri)) {
      this.loadFile();
    }
  };

  override onContextChanged(
    oldContext: { textPulledAt: string },
    newContext: { textPulledAt: string },
  ) {
    if (oldContext.textPulledAt !== newContext.textPulledAt) {
      this.loadFile();
    }
  }

  async loadFile() {
    const store = this.stores.workspace.current;
    const projectId = store?.project?.id;
    if (projectId) {
      const editor = Workspace.window.getActiveEditorForPane("logic");
      if (editor) {
        const { uri, visibleRange, selectedRange, originalFilename } = editor;
        const preserveEditor = Boolean(originalFilename);
        const files = await Workspace.fs.getFiles(projectId);
        const file = files[uri];
        const text = file?.text || "";
        const version = file?.version || 0;
        const languageId = file?.languageId || "sparkdown";
        if (
          uri !== this._uri ||
          version !== this._version ||
          text !== this._text
        ) {
          this._uri = uri;
          this._version = version;
          this._text = text;
          this.emit(
            MessageProtocol.event,
            LoadPreviewMessage.type.request({
              type: "screenplay",
              textDocument: {
                uri,
                languageId,
                version,
                text,
              },
              visibleRange,
              selectedRange,
              preserveEditor,
            }),
          );
        }
      }
    }
  }
}
