import { Language } from "@codemirror/language";
import {
  ChangeDesc,
  ChangeSet,
  Extension,
  MapMode,
  Text,
} from "@codemirror/state";
import { showDialog } from "@codemirror/view";
import type * as lsp from "vscode-languageserver-protocol";
import { LSPPlugin, lspPlugin } from "./plugin";
import { convertFromPosition, convertToChangeEvents } from "./pos";
import { lspTheme } from "./theme";
import { Transport } from "./transport";
import { versioning } from "./version";
import { DefaultWorkspace, Workspace, WorkspaceFile } from "./workspace";

class Request<Result> {
  declare resolve: (result: Result) => void;
  declare reject: (error: any) => void;
  promise: Promise<Result>;

  constructor(
    readonly id: string | number,
    readonly params: any,
    readonly timeout: number,
    readonly cancellationToken?: symbol,
  ) {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

const defaultClientCapabilities: lsp.ClientCapabilities = {
  general: {
    markdown: {
      parser: "marked",
    },
  },
  window: {
    showMessage: {},
  },
};

/// A workspace mapping is used to track changes made to open
/// documents, so that positions returned by a request can be
/// interpreted in terms of the current, potentially changed document.
export class WorkspaceMapping {
  /// @internal
  mappings: Map<string, ChangeDesc> = new Map();
  private startDocs: Map<string, Text> = new Map();

  /// @internal
  constructor(private client: LSPClient) {
    for (let file of client.workspace.files) {
      this.mappings.set(file.uri, ChangeSet.empty(file.doc.length));
      this.startDocs.set(file.uri, file.doc);
    }
  }

  /// @internal
  addChanges(uri: string, changes: ChangeDesc) {
    let known = this.mappings.get(uri);
    if (known) this.mappings.set(uri, known.composeDesc(changes));
  }

  /// Get the changes made to the document with the given URI since
  /// the mapping was created. Returns null for documents that aren't
  /// open.
  getMapping(uri: string) {
    let known = this.mappings.get(uri);
    if (!known) return null;
    let file = this.client.workspace.getFile(uri),
      view = file?.getView(),
      plugin = view && LSPPlugin.get(view);
    return plugin ? known.composeDesc(plugin.unsyncedChanges) : known;
  }

  /// Map a position in the given file forward to the current document state.
  mapPos(uri: string, pos: number, assoc?: number): number;
  mapPos(uri: string, pos: number, assoc: number, mode: MapMode): number | null;
  mapPos(
    uri: string,
    pos: number,
    assoc = -1,
    mode: MapMode = MapMode.Simple,
  ): number | null {
    let changes = this.getMapping(uri);
    return changes ? changes.mapPos(pos, assoc, mode) : pos;
  }

  /// Convert an LSP-style position referring to a document at the
  /// time the mapping was created to an offset in the current document.
  mapPosition(uri: string, pos: lsp.Position, assoc?: number): number;
  mapPosition(
    uri: string,
    pos: lsp.Position,
    assoc: number,
    mode: MapMode,
  ): number | null;
  mapPosition(
    uri: string,
    pos: lsp.Position,
    assoc = -1,
    mode: MapMode = MapMode.Simple,
  ): number | null {
    let start = this.startDocs.get(uri);
    if (!start)
      throw new Error("Cannot map from a file that's not in the workspace");
    let off = convertFromPosition(start, pos);
    let changes = this.getMapping(uri);
    return changes ? changes.mapPos(off, assoc, mode) : off;
  }

  /// Disconnect this mapping from the client so that it will no
  /// longer be notified of new changes. You must make sure to call
  /// this on every mapping you create, except when you use
  /// [`withMapping`](#lsp-client.LSPClient.withMapping), which will
  /// automatically schedule a disconnect when the given promise
  /// resolves or aborts.
  destroy() {
    this.client.activeMappings = this.client.activeMappings.filter(
      (m) => m != this,
    );
  }
}

const defaultNotificationListeners: {
  [method: string]: (client: LSPClient, params: any) => void;
} = {
  "window/logMessage": (client, params: lsp.LogMessageParams) => {
    if (params.type == 1) console.error("[lsp] " + params.message);
    else if (params.type == 2) console.warn("[lsp] " + params.message);
  },
  "window/showMessage": (client, params: lsp.ShowMessageParams) => {
    if (params.type > 3 /* Info */) return;
    let view;
    for (let f of client.workspace.files) if ((view = f.getView())) break;
    if (view)
      showDialog(view, {
        label: params.message,
        class:
          "cm-lsp-message cm-lsp-message-" +
          (params.type == 1 ? "error" : params.type == 2 ? "warning" : "info"),
        top: true,
      });
  },
};

export type RequestHandler<
  P = any,
  R extends string | number | boolean | object | any[] = any,
  E = any,
> = (
  client: LSPClient,
  params: P,
) => R | lsp.ResponseError<E> | Thenable<R | lsp.ResponseError<E>> | undefined;

export type NotificationListener<P = any> = (
  client: LSPClient,
  params: P,
  direction: "clientToServer" | "serverToClient",
) => boolean | void;

/// Configuration options that can be passed to the LSP client.
export type LSPClientConfig = {
  /// An optional function to create a
  /// [workspace](#lsp-client.Workspace) object for the client to use.
  /// When not given, this will default to a simple workspace that
  /// only opens files that have an active editor, and only allows one
  /// editor per file.
  workspace?: (client: LSPClient) => Workspace;
  /// The amount of milliseconds after which requests are
  /// automatically timed out. Defaults to 3000.
  timeout?: number;
  /// LSP servers can send Markdown code, which the client must render
  /// and display as HTML. Markdown can contain arbitrary HTML and is
  /// thus a potential channel for cross-site scripting attacks, if
  /// someone is able to compromise your LSP server or your connection
  /// to it. You can pass an HTML sanitizer here to strip out
  /// suspicious HTML structure.
  sanitizeHTML?: (html: string) => string;
  /// By default, the Markdown renderer will only be able to highlght
  /// code embedded in the Markdown text when its language tag matches
  /// the name of the language used by the editor. You can provide a
  /// function here that returns a CodeMirror language object for a
  /// given language tag to support more languages.
  highlightLanguage?: (name: string) => Language | null;
  /// By default, the client will only handle the server notifications
  /// `window/logMessage` (logging warnings and errors to the console)
  /// and `window/showMessage`. You can pass additional handlers here.
  /// They will be tried before the built-in handlers, and override
  /// those when they return true.
  notificationListeners?: {
    [method: string]: NotificationListener;
  };
  /// You can pass additional request handlers here.
  /// They will be tried before the built-in handlers, and override those.
  requestHandlers?: {
    [method: string]: RequestHandler;
  };
  extensions?: readonly (Extension | LSPClientExtension)[];
};

/// Objects of this type can be included in the
/// [`extensions`](#lsp-client.LSPClientConfig.extensions) option to
/// `LSPClient` to modularly configure client capabilities or
/// notification handlers.
export type LSPClientExtension = {
  /// Extra [client
  /// capabilities](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#clientCapabilities)
  /// to send to the server when initializing. The object provided
  /// here will be merged with the capabilities the client provides by
  /// default.
  clientCapabilities?: lsp.ClientCapabilities;
  /// Additional [request handlers](#lsp-client.LSPClientConfig.requestHandlers).
  /// These will be tried after request handlers defined directly
  /// in the config object, and then in order of appearance in the
  /// [`extensions`](#lsp-client.LSPClientConfig.extensions) array.
  requestHandlers?: {
    [method: string]: RequestHandler;
  };
  /// Will be executed when the client receives a matching notification.
  notificationListeners?: {
    [method: string]: NotificationListener;
  };
  /// An optional CodeMirror extension to include.
  editorExtension?: Extension;
  /// Called when the server requests that the client refresh a text document's content
  /// (This typically happens when an unopened workspace file has changed)
  onRefreshTextDocumentContent?: (client: LSPClient, uri: string) => void;
};

/// An LSP client manages a connection to a language server. It should
/// be explicitly [connected](#lsp-client.LSPClient.connect) before
/// use.
export class LSPClient {
  /// @internal
  transport: Transport | null = null;
  /// The client's [workspace](#lsp-client.Workspace).
  workspace: Workspace;
  private nextReqID = 0;
  /// @internal
  activeMappings: WorkspaceMapping[] = [];

  protected _initializeParams: lsp.InitializeParams | null = null;
  get initializeParams() {
    return this._initializeParams;
  }

  protected _initializeResult: lsp.InitializeResult | null = null;
  get initializeResult() {
    return this._initializeResult;
  }

  /// The capabilities advertised by the server. Will be null when not
  /// connected or initialized.
  get serverCapabilities() {
    return this._initializeResult.capabilities;
  }

  private get supportSync() {
    return this._initializeResult.capabilities.textDocumentSync == null
      ? 0
      : typeof this._initializeResult.capabilities.textDocumentSync == "number"
        ? this._initializeResult.capabilities.textDocumentSync
        : (this._initializeResult.capabilities.textDocumentSync.change ?? 0);
  }
  /// A promise that resolves once the client connection is initialized. Will be
  /// replaced by a new promise object when you call `disconnect`.
  initializing: Promise<null>;
  declare private init: {
    resolve: (value: null) => void;
    reject: (err: any) => void;
  };
  private timeout: number;
  /// @internal
  extensions: Extension[] = [];

  private cancellationTokens = new Map<symbol, string | number>();

  private requests = new Map<string | number, Request<any>>();

  /// Create a client object.
  constructor(
    /// @internal
    readonly config: LSPClientConfig = {},
  ) {
    this.receiveMessage = this.receiveMessage.bind(this);
    this.initializing = new Promise(
      (resolve, reject) => (this.init = { resolve, reject }),
    );
    this.timeout = config.timeout ?? 3000;
    this.workspace = config.workspace
      ? config.workspace(this)
      : new DefaultWorkspace(this);

    if (config.extensions)
      for (let ext of config.extensions) {
        if (Array.isArray(ext) || (ext as any).extension)
          this.extensions.push(ext as Extension);
        else if ((ext as LSPClientExtension).editorExtension)
          this.extensions.push((ext as LSPClientExtension).editorExtension!);
      }
  }

  /// Whether this client is connected (has a transport).
  get connected() {
    return !!this.transport;
  }

  getClientCapabilities() {
    let capabilities = defaultClientCapabilities;
    if (this.config.extensions) {
      for (let ext of this.config.extensions) {
        let { clientCapabilities } = ext as LSPClientExtension;
        if (clientCapabilities)
          capabilities = mergeCapabilities(capabilities, clientCapabilities);
      }
    }
    return capabilities;
  }

  getDefaultInitializeParams(): lsp.InitializeParams {
    const clientCapabilities = this.getClientCapabilities();
    return {
      rootUri: null,
      processId: null,
      clientInfo: {
        name: "@codemirror/lsp-client",
      },
      capabilities: clientCapabilities,
    };
  }

  /// Connect this client to a server over the given transport.
  /// If initializeResult is provided, assume the server has already been initialized and skip the initialization process,
  /// otherwise, immediately start the initialization exchange with the server.
  connect(
    transport: Transport,
    initializeParams?: lsp.InitializeParams,
    initializeResult?: lsp.InitializeResult,
  ) {
    this.setup(transport);

    const defaultInitializeParams = this.getDefaultInitializeParams();

    if (initializeResult) {
      this._initializeParams = initializeParams || defaultInitializeParams;
      this._initializeResult = initializeResult;
      this.init.resolve(null);
    } else {
      this._initializeParams = {
        ...(initializeParams || {}),
        rootUri: initializeParams?.rootUri ?? null,
        processId: initializeParams?.processId ?? null,
        clientInfo: {
          ...defaultInitializeParams.clientInfo,
          ...(initializeParams?.clientInfo || {}),
        },
        capabilities: mergeCapabilities(
          defaultInitializeParams.capabilities,
          initializeParams.capabilities,
        ),
      };
      this.requestInner<
        lsp.InitializeParams,
        lsp.InitializeResult,
        "initialize"
      >("initialize", this._initializeParams).promise.then((result) => {
        this._initializeResult = result;
        transport.send(
          JSON.stringify({
            jsonrpc: "2.0",
            method: "initialized",
            params: {},
          }),
        );
        this.init.resolve(null);
      }, this.init.reject);
    }

    this.workspace.connected(this);

    return this;
  }

  private setup(transport: Transport) {
    if (this.transport) {
      this.transport.unsubscribe(this.receiveMessage);
    }
    this.transport = transport;
    transport.subscribe(this.receiveMessage);

    if (this.transport.connection) {
      // When a connection is provided, request handlers must be routed through
      // the connection so that the connection doesn't report `Unhandled method` errors
      this.transport.connection.onRequest(
        "workspace/textDocumentContent/refresh",
        (params) => this.refreshTextDocumentContent(params),
      );
      if (this.config.requestHandlers) {
        for (const [method, handler] of Object.entries(
          this.config.requestHandlers,
        )) {
          this.transport.connection.onRequest(method, (params) =>
            handler(this, params),
          );
        }
      }
      if (this.config.extensions) {
        for (let ext of this.config.extensions) {
          let { requestHandlers } = ext as LSPClientExtension;
          if (requestHandlers) {
            for (const [method, handler] of Object.entries(requestHandlers)) {
              this.transport.connection.onRequest(method, (params) =>
                handler(this, params),
              );
            }
          }
        }
      }
    }
  }

  /// Disconnect the client from the server.
  disconnect() {
    if (this.transport) this.transport.unsubscribe(this.receiveMessage);
    this._initializeResult = null;
    this.initializing = new Promise(
      (resolve, reject) => (this.init = { resolve, reject }),
    );
    this.workspace.disconnected();
  }

  /// Create a plugin for this client, to add to an editor
  /// configuration. This extension is necessary to use LSP-related
  /// functionality exported by this package. The returned extension
  /// will include the editor
  /// extensions included in this client's
  /// [configuration](#lsp-client.LSPClientConfig.extensions).
  ///
  /// Creating an editor with this plugin will cause
  /// [`openFile`](#lsp-client.Workspace.openFile) to be called on the
  /// workspace.
  ///
  /// By default, the language ID given to the server for this file is
  /// derived from the editor's language configuration via
  /// [`Language.name`](#language.Language.name). You can pass in
  /// a specific ID as a third parameter.
  plugin(
    textDocument: { uri: string; version: number },
    languageID?: string,
  ): Extension {
    return [
      lspPlugin.of({ client: this, uri: textDocument.uri, languageID }),
      lspTheme,
      this.extensions,
      versioning(textDocument.version),
    ];
  }

  /// Send a `textDocument/didOpen` notification to the server.
  didOpen(file: WorkspaceFile) {
    this.notification<lsp.DidOpenTextDocumentParams>("textDocument/didOpen", {
      textDocument: {
        uri: file.uri,
        languageId: file.languageId,
        text: file.doc.toString(),
        version: file.version,
      },
    });
  }

  /// Send a `textDocument/didClose` notification to the server.
  didClose(uri: string) {
    this.notification<lsp.DidCloseTextDocumentParams>("textDocument/didClose", {
      textDocument: { uri },
    });
  }

  didChange(file: WorkspaceFile, changes: ChangeSet, prevDoc: Text) {
    this.notification<lsp.DidChangeTextDocumentParams>(
      "textDocument/didChange",
      {
        textDocument: { uri: file.uri, version: file.version },
        contentChanges: contentChangesFor(
          file,
          prevDoc,
          changes,
          this.supportSync == 2 /* Incremental */,
        ),
      },
    );
  }

  async fetchTextDocumentContent(params: {
    uri: string;
  }): Promise<{ text: string }> {
    const uri = params.uri;
    const { text } = await this.request<
      { uri: string },
      { text: string },
      "workspace/textDocumentContent"
    >("workspace/textDocumentContent", { uri });
    return { text };
  }

  async refreshTextDocumentContent(params: { uri: string }): Promise<null> {
    const uri = params.uri;
    const { text } = await this.fetchTextDocumentContent({ uri });
    if (text != null) {
      this.workspace.refreshFileContent(uri, text);
    }
    if (this.config.extensions) {
      for (let ext of this.config.extensions) {
        let { onRefreshTextDocumentContent } = ext as LSPClientExtension;
        if (onRefreshTextDocumentContent) {
          onRefreshTextDocumentContent(this, uri);
        }
      }
    }
    return null;
  }

  private async receiveMessage(msg: string) {
    const value = JSON.parse(msg) as
      | lsp.ResponseMessage
      | lsp.NotificationMessage
      | lsp.RequestMessage;
    if ("id" in value && !("method" in value)) {
      const req = this.requests.get(value.id);
      if (req) {
        clearTimeout(req.timeout);
        if (value.error) {
          req.reject(value.error);
        } else {
          req.resolve(value.result);
        }
        this.cancellationTokens.delete(req.cancellationToken);
        this.requests.delete(value.id);
      }
    } else if (!("id" in value)) {
      let handler = this.config.notificationListeners?.[value.method];
      if (handler && handler(this, value.params, "serverToClient")) {
        return;
      }
      if (this.config.extensions) {
        for (let ext of this.config.extensions) {
          let { notificationListeners } = ext as LSPClientExtension;
          let handler = notificationListeners?.[value.method];
          if (handler && handler(this, value.params, "serverToClient")) {
            return;
          }
        }
      }
      let deflt = defaultNotificationListeners[value.method];
      if (deflt) {
        deflt(this, value.params);
      }
    } else if ("id" in value && "method" in value) {
      if (!this.transport.connection) {
        // If no connection is provided, handle responding to requests directly
        if (value.method === "workspace/textDocumentContent/refresh") {
          this.respond(value, (client, params: { uri: string }) =>
            client.refreshTextDocumentContent(params),
          );
        }
        let handler = this.config.requestHandlers?.[value.method];
        if (handler) {
          if (this.respond(value, handler)) {
            return;
          }
        }
        if (this.config.extensions) {
          for (let ext of this.config.extensions) {
            let { requestHandlers } = ext as LSPClientExtension;
            let handler = requestHandlers?.[value.method];
            if (handler) {
              if (this.respond(value, handler)) {
                return;
              }
            }
          }
        }
        let resp: lsp.ResponseMessage = {
          jsonrpc: "2.0",
          id: value.id,
          error: {
            code: -32601 /* MethodNotFound */,
            message: `Method not implemented: ${value.method}`,
          },
        };
        this.transport!.send(JSON.stringify(resp));
      }
    }
  }

  private respond<P, R extends string | number | boolean | object | any[], E>(
    value: lsp.RequestMessage,
    handler: RequestHandler<P, R, E>,
  ) {
    try {
      const result = handler(this, value.params as P);
      if (result !== undefined) {
        let resp: lsp.ResponseMessage = {
          jsonrpc: "2.0",
          id: value.id,
          result,
        };
        this.transport!.send(JSON.stringify(resp));
        return true;
      }
    } catch (err: any) {
      let resp: lsp.ResponseMessage = {
        jsonrpc: "2.0",
        id: value.id,
        error: {
          code: -32603 /* InternalError */,
          message: err.message,
        },
      };
      this.transport!.send(JSON.stringify(resp));
    }
    return false;
  }

  /// Make a request to the server. Returns a promise that resolves to
  /// the response or rejects with a failure message. You'll probably
  /// want to use types from the `vscode-languageserver-protocol`
  /// package for the type parameters.
  ///
  /// The caller is responsible for
  /// [synchronizing](#lsp-client.LSPClient.sync) state before the
  /// request and correctly handling state drift caused by local
  /// changes that happend during the request.
  request<Params, Result, Method extends string>(
    method: Method,
    params: Params,
  ): Promise<Result> {
    if (!this.transport)
      return Promise.reject(new Error("Client not connected"));
    return this.initializing.then(
      () => this.requestInner<Params, Result, Method>(method, params).promise,
    );
  }

  private requestInner<Params, Result, Method extends string>(
    method: Method,
    params: Params,
    cancellationToken?: symbol,
  ): Request<Result> {
    const id = crypto.randomUUID();
    const data: lsp.RequestMessage = {
      jsonrpc: "2.0",
      id,
      method,
      params: params as any,
    };
    if (cancellationToken) {
      this.cancellationTokens.set(cancellationToken, id);
    }
    let req = new Request<Result>(
      id,
      params,
      setTimeout(() => {
        req.reject(new Error("Request timed out"));
        if (cancellationToken) {
          this.cancellationTokens.delete(cancellationToken);
        }
        this.requests.delete(id);
      }, this.timeout),
      cancellationToken,
    );
    this.requests.set(id, req);
    try {
      this.transport!.send(JSON.stringify(data));
    } catch (e) {
      req.reject(e);
    }
    return req;
  }

  /// Send a notification to the server.
  notification<Params>(method: string, params: Params) {
    if (!this.transport) {
      return;
    }
    this.initializing.then(() => {
      let data: lsp.NotificationMessage = {
        jsonrpc: "2.0",
        method,
        params: params as any,
      };
      this.transport!.send(JSON.stringify(data));
      let handler = this.config.notificationListeners?.[data.method];
      if (handler && handler(this, data.params, "clientToServer")) {
        return;
      }
      if (this.config.extensions) {
        for (let ext of this.config.extensions) {
          let { notificationListeners } = ext as LSPClientExtension;
          let handler = notificationListeners?.[data.method];
          if (handler && handler(this, data.params, "clientToServer")) {
            return;
          }
        }
      }
    });
  }

  /// Cancel the in-progress request with the given parameter value
  /// (which is compared by identity).
  cancelRequest(cancellationToken: symbol) {
    const id = this.cancellationTokens.get(cancellationToken);
    if (id != null) this.notification("$/cancelRequest", { id });
  }

  /// @internal
  hasCapability(name: keyof lsp.ServerCapabilities) {
    return this._initializeResult
      ? Boolean(this.serverCapabilities[name])
      : null;
  }

  /// Create a [workspace mapping](#lsp-client.WorkspaceMapping) that
  /// tracks changes to files in this client's workspace, relative to
  /// the moment where it was created. Make sure you call
  /// [`destroy`](#lsp-client.WorkspaceMapping.destroy) on the mapping
  /// when you're done with it.
  workspaceMapping() {
    let mapping = new WorkspaceMapping(this);
    this.activeMappings.push(mapping);
    return mapping;
  }

  /// Run the given promise with a [workspace
  /// mapping](#lsp-client.WorkspaceMapping) active. Automatically
  /// release the mapping when the promise resolves or rejects.
  withMapping<T>(f: (mapping: WorkspaceMapping) => Promise<T>): Promise<T> {
    let mapping = this.workspaceMapping();
    return f(mapping).finally(() => mapping.destroy());
  }

  /// Push any [pending changes](#lsp-client.Workspace.syncFiles) in
  /// the open files to the server. You'll want to call this before
  /// most types of requests, to make sure the server isn't working
  /// with outdated information.
  sync() {
    for (let { file, changes, prevDoc } of this.workspace.syncFiles()) {
      for (let mapping of this.activeMappings) {
        mapping.addChanges(file.uri, changes);
      }
      if (this.supportSync) {
        this.didChange(file, changes, prevDoc);
      }
    }
  }
}

const enum Sync {
  AlwaysIfSmaller = 1024,
}

function contentChangesFor(
  file: WorkspaceFile,
  startDoc: Text,
  changes: ChangeSet,
  supportInc: boolean,
): lsp.TextDocumentContentChangeEvent[] {
  if (!supportInc || file.doc.length < Sync.AlwaysIfSmaller)
    return [{ text: file.doc.toString() }];
  return convertToChangeEvents(startDoc, changes);
}

function mergeCapabilities(base: any, add?: any) {
  if (add == null) return base;
  if (typeof base != "object" || typeof add != "object") return add;
  let result: Record<string, any> = {};
  let baseProps = Object.keys(base),
    addProps = Object.keys(add);
  for (let prop of baseProps)
    result[prop] =
      addProps.indexOf(prop) > -1
        ? mergeCapabilities(base[prop], add[prop])
        : base[prop];
  for (let prop of addProps)
    if (baseProps.indexOf(prop) < 0) result[prop] = add[prop];
  return result;
}
