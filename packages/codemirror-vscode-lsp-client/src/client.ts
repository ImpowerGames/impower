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

export class RequestTimeoutError extends Error {
  constructor() {
    super("Request timed out");
    this.name = "RequestTimeoutError";
  }
}

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

export class WorkspaceMapping {
  mappings: Map<string, ChangeDesc> = new Map();
  private startDocs: Map<string, Text> = new Map();

  constructor(private client: LSPClient) {
    for (let file of client.workspace.files) {
      this.mappings.set(file.uri, ChangeSet.empty(file.doc.length));
      this.startDocs.set(file.uri, file.doc);
    }
  }

  addChanges(uri: string, changes: ChangeDesc) {
    let known = this.mappings.get(uri);
    if (known) this.mappings.set(uri, known.composeDesc(changes));
  }

  getMapping(uri: string) {
    let known = this.mappings.get(uri);
    if (!known) return null;
    let file = this.client.workspace.getFile(uri),
      view = file?.getView(),
      plugin = view && LSPPlugin.get(view);
    return plugin ? known.composeDesc(plugin.unsyncedChanges) : known;
  }

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

  destroy() {
    this.client.activeMappings = this.client.activeMappings.filter(
      (m) => m != this,
    );
  }
}

const defaultNotificationListeners: {
  [method: string]: (client: LSPClient, params: any) => void;
} = {
  "window/logMessage": (_client, params: lsp.LogMessageParams) => {
    if (params.type == 1) console.error("[lsp] " + params.message);
    else if (params.type == 2) console.warn("[lsp] " + params.message);
  },
  "window/showMessage": (client, params: lsp.ShowMessageParams) => {
    if (params.type > 3) return;
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

export type LSPClientConfig = {
  workspace?: (client: LSPClient) => Workspace;
  timeout?: number;
  sanitizeHTML?: (html: string) => string;
  highlightLanguage?: (name: string) => Language | null;
  notificationListeners?: {
    [method: string]: NotificationListener;
  };
  requestHandlers?: {
    [method: string]: RequestHandler;
  };
  extensions?: readonly (Extension | LSPClientExtension)[];
};

export type LSPClientExtension = {
  clientCapabilities?: lsp.ClientCapabilities;
  requestHandlers?: {
    [method: string]: RequestHandler;
  };
  notificationListeners?: {
    [method: string]: NotificationListener;
  };
  editorExtension?: Extension;
  onRefreshTextDocumentContent?: (client: LSPClient, uri: string) => void;
};

export class LSPClient {
  transport: Transport | null = null;
  workspace: Workspace;
  activeMappings: WorkspaceMapping[] = [];

  protected _initializeParams: lsp.InitializeParams | null = null;
  get initializeParams() {
    return this._initializeParams;
  }

  protected _initializeResult: lsp.InitializeResult | null = null;
  get initializeResult() {
    return this._initializeResult;
  }

  get serverCapabilities() {
    return this._initializeResult?.capabilities ?? null;
  }

  private get supportSync() {
    const sync = this._initializeResult?.capabilities.textDocumentSync;
    return sync == null
      ? 0
      : typeof sync == "number"
        ? sync
        : (sync.change ?? 0);
  }
  initializing: Promise<null>;
  declare private init: {
    resolve: (value: null) => void;
    reject: (err: any) => void;
  };
  private timeout: number;
  extensions: Extension[] = [];

  private cancellationTokens = new Map<symbol, string | number>();

  private requests = new Map<string | number, Request<any>>();

  constructor(
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
        } as lsp.InitializeParams["clientInfo"],
        capabilities: mergeCapabilities(
          defaultInitializeParams.capabilities,
          initializeParams?.capabilities,
        ),
      };
      this.requestInner<
        lsp.InitializeParams,
        lsp.InitializeResult,
        "initialize"
      >("initialize", this._initializeParams!).promise.then((result) => {
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
      // workaround(vscode-jsonrpc): a MessageConnection answers requests it has no handler for with `Unhandled method`, so handlers register on it
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

  disconnect() {
    if (this.transport) this.transport.unsubscribe(this.receiveMessage);
    this._initializeResult = null;
    this.initializing = new Promise(
      (resolve, reject) => (this.init = { resolve, reject }),
    );
    this.workspace.disconnected();
  }

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
          this.supportSync == 2,
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

  private async receiveMessage(msg: string | object) {
    const value = (typeof msg === "string" ? JSON.parse(msg) : msg) as
      | lsp.ResponseMessage
      | lsp.NotificationMessage
      | lsp.RequestMessage;
    if ("id" in value && !("method" in value)) {
      const req = this.requests.get(value.id!);
      if (req) {
        clearTimeout(req.timeout);
        if (value.error) {
          req.reject(value.error);
        } else {
          req.resolve(value.result);
        }
        this.cancellationTokens.delete(req.cancellationToken!);
        this.requests.delete(value.id!);
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
      if (!this.transport?.connection) {
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
            code: -32601,
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
          code: -32603,
          message: err.message,
        },
      };
      this.transport!.send(JSON.stringify(resp));
    }
    return false;
  }

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
      self.setTimeout(() => {
        req.reject(new RequestTimeoutError());
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

  cancelRequest(cancellationToken: symbol) {
    const id = this.cancellationTokens.get(cancellationToken);
    if (id != null) this.notification("$/cancelRequest", { id });
  }

  hasCapability(name: keyof lsp.ServerCapabilities) {
    return this._initializeResult
      ? Boolean(this.serverCapabilities?.[name])
      : null;
  }

  workspaceMapping() {
    let mapping = new WorkspaceMapping(this);
    this.activeMappings.push(mapping);
    return mapping;
  }

  withMapping<T>(f: (mapping: WorkspaceMapping) => Promise<T>): Promise<T> {
    let mapping = this.workspaceMapping();
    return f(mapping).finally(() => mapping.destroy());
  }

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
