import {
  MessageProtocol,
  sendProtocolMessage,
} from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import type { GamePosition } from "@impower/spark-editor-protocol/src/types";
import type { FileAccessor } from "@impower/spark-debug-adapter/src/SparkDebugSession";
import { Connection } from "@impower/spark-engine/src/game/core/classes/Connection";
import { GameExecutedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameExecutedMessage";
import { GameSteppedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameSteppedMessage";
import type { DebugProtocol } from "@vscode/debugprotocol";
import workspace, { IDLE_DEBUG_SESSION, type DebugSessionState } from "./WorkspaceStore";

export interface DebugAdapter {
  handleMessage(message: DebugProtocol.ProtocolMessage): void;
  onDidSendMessage(listener: (message: DebugProtocol.ProtocolMessage) => void): unknown;
  dispose(): void;
}

export interface WorkspaceDebugClientOptions {
  onStop?: (position: GamePosition) => void;
  onRefusal?: (message: string) => void;
  createAdapter?: (connection: Connection) => Promise<DebugAdapter>;
  target?: EventTarget;
}

const webFiles: FileAccessor = {
  isWindows: false,
  readFile: async () => new Uint8Array(),
  writeFile: async () => {},
  showFile: async () => {},
  getSelectedLine: async () => undefined,
  revealLine: async () => {},
  isActiveTextEditor: () => false,
  pathToUri: (path) => path,
  uriToPath: (uri) => uri,
  getRootPath: () => undefined,
};

const createSparkDebugSession = async (connection: Connection): Promise<DebugAdapter> => {
  const { SparkDebugSession } = await import(
    "@impower/spark-debug-adapter/src/SparkDebugSession"
  );
  return new SparkDebugSession(webFiles, connection, {
    syncCursorToExecution: false,
  }) as unknown as DebugAdapter;
};

interface Session {
  adapter?: DebugAdapter;
  ready: Promise<boolean>;
  pending: Map<number, (response: DebugProtocol.Response | null) => void>;
  seq: number;
  stops: number;
  stopListening: () => void;
}

export default class WorkspaceDebugClient {
  protected _session?: Session;

  constructor(protected readonly _options: WorkspaceDebugClientOptions = {}) {}

  start(program: string) {
    this.end();
    const target = this._options.target ?? window;
    const awaiting = new Set<string | number>();
    const connection = new Connection({
      onSend: (message) => {
        if ("id" in message && message.id != null) {
          awaiting.add(message.id);
        }
        sendProtocolMessage(message, target);
      },
    });
    const listener = (e: Event) => {
      const message = e instanceof CustomEvent ? e.detail : undefined;
      if (!message || typeof message !== "object") {
        return;
      }
      if ("id" in message) {
        if (!("params" in message) && awaiting.delete(message.id)) {
          connection.receive(message);
        }
        return;
      }
      if (typeof message.method !== "string") {
        return;
      }
      if (
        (GameSteppedMessage.type.isNotification(message) ||
          GameExecutedMessage.type.isNotification(message)) &&
        message.params.history
      ) {
        this.update({ canStepOut: message.params.history.canStepOut });
      }
      if (message.method.startsWith("game/") || message.method.startsWith("preview/")) {
        connection.receive(message);
      }
    };
    target.addEventListener(MessageProtocol.event, listener);
    const session: Session = {
      ready: Promise.resolve(false),
      pending: new Map(),
      seq: 0,
      stops: 0,
      stopListening: () => target.removeEventListener(MessageProtocol.event, listener),
    };
    this._session = session;
    workspace.debugSession.value = IDLE_DEBUG_SESSION;
    session.ready = (async () => {
      let adapter: DebugAdapter;
      try {
        adapter = await (this._options.createAdapter ?? createSparkDebugSession)(connection);
      } catch (e) {
        this._options.onRefusal?.(e instanceof Error ? e.message : String(e));
        return false;
      }
      if (this._session !== session) {
        adapter.dispose();
        return false;
      }
      session.adapter = adapter;
      adapter.onDidSendMessage((message) => this.receive(session, message));
      const handshake = [
        await this.request(session, "initialize", {
          clientID: "impower-dev",
          clientName: "Impower",
          adapterID: "game",
          pathFormat: "path",
          linesStartAt1: false,
          columnsStartAt1: false,
        }),
        await this.request(session, "launch", { program }),
      ];
      const saved = Object.entries(workspace.current.debug.breakpoints ?? {});
      for (const [uri, lines] of saved.length > 0 ? saved : [[program, []] as const]) {
        handshake.push(await this.sendBreakpoints(session, uri, [...lines]));
      }
      handshake.push(await this.request(session, "configurationDone", {}));
      const refused = handshake.find((response) => response && !response.success);
      if (refused) {
        this._options.onRefusal?.(refused.message ?? "");
      }
      return !refused && handshake.every(Boolean);
    })();
    return session.ready;
  }

  end() {
    const session = this._session;
    if (!session) {
      return;
    }
    this._session = undefined;
    session.stopListening();
    session.adapter?.dispose();
    for (const resolve of session.pending.values()) {
      resolve(null);
    }
    session.pending.clear();
    workspace.debugSession.value = IDLE_DEBUG_SESSION;
  }

  pause() {
    return this.command("pause");
  }

  async continue() {
    const session = this._session;
    const stops = session?.stops;
    const accepted = await this.command("continue");
    if (accepted && session && this._session === session && session.stops === stops) {
      session.stops += 1;
      this.update({ stopped: null, stackTrace: null });
    }
    return accepted;
  }

  next() {
    return this.command("next");
  }

  stepIn() {
    return this.command("stepIn");
  }

  stepOut() {
    return this.command("stepOut");
  }

  async setBreakpoints(uri: string, lines: number[]) {
    const session = this._session;
    if (!session || !(await session.ready) || this._session !== session) {
      return false;
    }
    const response = await this.sendBreakpoints(session, uri, lines);
    return Boolean(response?.success);
  }

  async evaluate(expression: string) {
    const session = this._session;
    const frameId =
      workspace.debugSession.peek().stackTrace?.stackFrames[0]?.id;
    if (!session || frameId == null || !workspace.debugSession.peek().stopped) {
      return null;
    }
    const response = (await this.request(session, "evaluate", {
      expression,
      frameId,
      context: "hover",
    })) as DebugProtocol.EvaluateResponse | null;
    return response?.success ? response.body.result : null;
  }

  protected async sendBreakpoints(
    session: Session,
    uri: string,
    lines: number[],
  ) {
    const response = (await this.request(session, "setBreakpoints", {
      source: { path: uri },
      breakpoints: lines.map((line) => ({ line })),
    })) as DebugProtocol.SetBreakpointsResponse | null;
    if (!response || this._session !== session) {
      return response;
    }
    if (!response.success) {
      this._options.onRefusal?.(response.message ?? "");
      return response;
    }
    const answered = response.body?.breakpoints ?? [];
    if (answered.length === lines.length) {
      this.update({
        breakpoints: {
          ...workspace.debugSession.peek().breakpoints,
          [uri]: answered.map((b, i) => ({
            line: b.verified && b.line != null ? b.line : lines[i]!,
            verified: b.verified,
          })),
        },
      });
    }
    return response;
  }

  protected async command(command: string) {
    const session = this._session;
    if (!session || !(await session.ready)) {
      return false;
    }
    const threadId = workspace.debugSession.peek().stopped?.threadId ?? 0;
    const response = await this.request(session, command, { threadId });
    if (!response) {
      return false;
    }
    if (!response.success) {
      this._options.onRefusal?.(response.message ?? "");
    }
    return response.success;
  }

  protected request(session: Session, command: string, args: unknown) {
    return new Promise<DebugProtocol.Response | null>((resolve) => {
      const adapter = session.adapter;
      if (this._session !== session || !adapter) {
        resolve(null);
        return;
      }
      session.seq += 1;
      session.pending.set(session.seq, resolve);
      adapter.handleMessage({
        seq: session.seq,
        type: "request",
        command,
        arguments: args,
      } as DebugProtocol.Request);
    });
  }

  protected receive(session: Session, message: DebugProtocol.ProtocolMessage) {
    if (this._session !== session) {
      return;
    }
    if (message.type === "response") {
      const response = message as DebugProtocol.Response;
      const resolve = session.pending.get(response.request_seq);
      session.pending.delete(response.request_seq);
      resolve?.(response);
      return;
    }
    if (message.type !== "event") {
      return;
    }
    const event = message as DebugProtocol.Event;
    if (event.event === "stopped") {
      void this.stopped(session, (event as DebugProtocol.StoppedEvent).body);
    }
    if (event.event === "continued") {
      session.stops += 1;
      this.update({ stopped: null, stackTrace: null });
    }
  }

  protected async stopped(
    session: Session,
    stopped: DebugProtocol.StoppedEvent["body"],
  ) {
    session.stops += 1;
    const stop = session.stops;
    this.update({ stopped, stackTrace: null });
    const response = (await this.request(session, "stackTrace", {
      threadId: stopped.threadId ?? 0,
    })) as DebugProtocol.StackTraceResponse | null;
    if (this._session !== session || session.stops !== stop || !response) {
      return;
    }
    if (!response.success) {
      this._options.onRefusal?.(response.message ?? "");
      return;
    }
    this.update({ stackTrace: response.body });
    const top = response.body.stackFrames[0];
    if (top?.source?.path) {
      this._options.onStop?.({ uri: top.source.path, line: top.line });
    }
  }

  protected update(change: Partial<DebugSessionState>) {
    workspace.debugSession.value = { ...workspace.debugSession.peek(), ...change };
  }
}
