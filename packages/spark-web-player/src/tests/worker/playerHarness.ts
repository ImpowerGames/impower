import { MessageConnection } from "@impower/jsonrpc/src/browser/classes/MessageConnection";
import { DEFAULT_DESCRIPTION_DEFINITIONS } from "@impower/spark-engine/src/game/modules/DEFAULT_DESCRIPTION_DEFINITIONS";
import { DEFAULT_OPTIONAL_DEFINITIONS } from "@impower/spark-engine/src/game/modules/DEFAULT_OPTIONAL_DEFINITIONS";
import { DEFAULT_SCHEMA_DEFINITIONS } from "@impower/spark-engine/src/game/modules/DEFAULT_SCHEMA_DEFINITIONS";
import type { CompiledProgramParams } from "@impower/sparkdown/src/compiler/classes/messages/CompiledProgramMessage";
import { CompileProgramMessage } from "@impower/sparkdown/src/compiler/classes/messages/CompileProgramMessage";
import { CompilerInitializeMessage } from "@impower/sparkdown/src/compiler/classes/messages/CompilerInitializeMessage";
import { ConfigureCompilerMessage } from "@impower/sparkdown/src/compiler/classes/messages/ConfigureCompilerMessage";
import { PreviewCompileProgramMessage } from "@impower/sparkdown/src/compiler/classes/messages/PreviewCompileProgramMessage";
import { SelectCompilerDocumentMessage } from "@impower/sparkdown/src/compiler/classes/messages/SelectCompilerDocumentMessage";
import { UpdateCompilerDocumentMessage } from "@impower/sparkdown/src/compiler/classes/messages/UpdateCompilerDocumentMessage";
import { Clock } from "@impower/spark-engine/src/game/core/classes/Clock";
import type { GameEndpoint } from "../../app/Application";
import type { ImageTarget } from "../../app/assets/AssetCache";
import { MessageRouter } from "../../app/MessageRouter";
import AssetManager from "../../app/managers/AssetManager";
import UIManager from "../../app/managers/UIManager";
import { GamePlayerController, setWorkspace } from "../../GamePlayerController";
import { installPlayerWorker } from "../../main/workers/installPlayerWorker";
import { ProgramHeldMessage } from "../../main/workers/messages/ProgramHeldMessage";
import type { WorkerBusyParams } from "../../main/workers/messages/WorkerBusyMessage";
import { respondToWorkerHang } from "../../main/workers/respondToWorkerHang";
import { SetAsidePoints } from "../../main/workers/SetAsidePoints";
import type {
  PreviewPoint,
  WorkerHang,
} from "../../main/workers/WorkerDisplayWorkspace";
import { CompilerRestartedError } from "@impower/sparkdown/src/workspace/classes/SparkdownWorkspace";
import { WorkerGameLink } from "../../main/workers/WorkerGameLink";
import {
  createFakeImage,
  createStubApp,
  installJSDOM,
  serializeDOM,
  SilentPageManager,
} from "../ui/domTestHarness";

export const MAIN_URI = "file:///local/main.sd";

export class LoopbackConnection extends MessageConnection {
  peer?: LoopbackConnection;

  closed = false;

  protected _listeners = new Set<(e: MessageEvent) => void>();

  constructor(protected onPost?: (message: any) => void) {
    super((message) => this.deliver(message));
  }

  protected deliver(message: any) {
    const copy = structuredClone(message);
    this.onPost?.(copy);
    const peer = this.peer;
    if (this.closed || peer?.closed) {
      return;
    }
    setTimeout(() => {
      for (const listener of [...(peer?._listeners ?? [])]) {
        listener({ data: copy } as MessageEvent);
      }
    }, 0);
  }

  override addEventListener(_event: "message", listener: (e: MessageEvent) => void) {
    this._listeners.add(listener);
  }

  override removeEventListener(_event: "message", listener: (e: MessageEvent) => void) {
    this._listeners.delete(listener);
  }
}

function loopbackBroadcastChannel(onPost: (message: any) => void) {
  const open = new Map<string, Set<LoopbackBroadcastChannel>>();
  class LoopbackBroadcastChannel {
    onmessage: ((e: MessageEvent) => void) | null = null;

    constructor(readonly name: string) {
      let named = open.get(name);
      if (!named) {
        named = new Set();
        open.set(name, named);
      }
      named.add(this);
    }

    postMessage(message: any) {
      if (!open.get(this.name)?.has(this)) {
        throw new Error("BroadcastChannel is closed");
      }
      const copy = structuredClone(message);
      onPost(copy);
      const peers = [...open.get(this.name)!].filter((c) => c !== this);
      setTimeout(() => {
        for (const peer of peers) {
          if (open.get(this.name)?.has(peer)) {
            peer.onmessage?.({ data: copy } as MessageEvent);
          }
        }
      }, 0);
    }

    close() {
      open.get(this.name)?.delete(this);
    }
  }
  return LoopbackBroadcastChannel;
}

export const settle = async (tasks = 20) => {
  for (let i = 0; i < tasks; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

export const holdFirstInit = (h: any) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const apps: any[] = [];
  const createApp = h.controller.createApp.bind(h.controller);
  h.controller.createApp = (...args: unknown[]) => {
    const app = createApp(...args);
    if (apps.push(app) === 1) {
      const init = app.init.bind(app);
      app.init = async () => {
        await held;
        await init();
      };
    }
    return app;
  };
  return { apps, release };
};

export const writtenText = (sent: any[]): string => {
  const texts: string[] = [];
  const collect = (value: any) => {
    if (value && typeof value === "object") {
      if (typeof value.text === "string") texts.push(value.text);
      for (const item of Object.values(value)) collect(item);
    }
  };
  for (const m of sent) {
    if (m.method === "ui/write-text") collect(m.params);
    if (m.method === "ui/beat") {
      for (const op of m.params?.messages ?? []) {
        if (op.method === "ui/write-text") collect(op.params);
      }
    }
  }
  return texts.join("");
};

export interface PlayerHarnessOptions {
  files: { uri: string; text: string }[];
  startFrom: { file: string; line: number };
  holdImage?: (src: string) => Promise<void> | undefined;
  recordMessages?: boolean;
  manualClock?: boolean;
}

export async function createPlayerHarness(options: PlayerHarnessOptions) {
  const { win, overlay, restore: restoreDOM } = installJSDOM();
  const g = globalThis as any;
  const { Event, CustomEvent, BroadcastChannel } = g;
  g.Event = win.Event;
  g.CustomEvent = win.CustomEvent;
  const restore = () => {
    g.Event = Event;
    g.CustomEvent = CustomEvent;
    g.BroadcastChannel = BroadcastChannel;
    restoreDOM();
  };
  const toPage: any[] = [];
  const recordMessages = options.recordMessages !== false;
  const onChannel: any[] = [];
  g.BroadcastChannel = loopbackBroadcastChannel((message) => {
    if (recordMessages) {
      toPage.push(message);
      onChannel.push(message);
    }
  });
  const clock = { now: 1_000_000, frames: [] as (() => void)[] };
  const versions = new Map(options.files.map((f) => [f.uri, 1]));

  const createWorker = () => {
    const page = new LoopbackConnection();
    const worker = new LoopbackConnection((message) => {
      if (recordMessages) toPage.push(message);
    });
    page.peer = worker;
    worker.peer = page;
    const workerState = installPlayerWorker(worker);
    if (options.manualClock) {
      workerState.gameState.systemConfiguration.now = () => clock.now;
      workerState.gameState.systemConfiguration.requestFrame = (callback) => {
        clock.frames.push(callback);
        return clock.frames.length;
      };
    }
    return { page, workerState };
  };

  const initialize = async (page: LoopbackConnection) => {
    await page.sendRequest(CompilerInitializeMessage.type, {
      profilerId: "test",
    });
    await configure(page);
  };

  const configure = (page: LoopbackConnection) =>
    page.sendRequest(ConfigureCompilerMessage.type, {
      files: options.files.map((f) => ({
        uri: f.uri,
        type: "script",
        name: f.uri.split("/").at(-1)!.split(".")[0]!,
        ext: "sd",
        text: f.text,
        version: 1,
        languageId: "sparkdown",
      })),
      definitions: {
        optionals: DEFAULT_OPTIONAL_DEFINITIONS,
        schemas: DEFAULT_SCHEMA_DEFINITIONS,
        descriptions: DEFAULT_DESCRIPTION_DEFINITIONS,
      },
      skipValidation: true,
      workspace: "file:///local",
      startFrom: options.startFrom,
    } as any);

  const started = createWorker();
  await initialize(started.page);
  let page = started.page;
  let workerState = started.workerState;

  let programVersion = 0;
  let completionRequest = 0;
  let selected = options.startFrom;
  let held: Promise<void> = Promise.resolve();
  const link = new WorkerGameLink(page);
  const hangListeners = new Set<(hang: WorkerHang) => void>();
  const setAsidePoints = new SetAsidePoints((): string =>
    SetAsidePoints.revision(
      workspace.documentsRevision,
      workspace.filesRevision,
    ),
  );
  const workspace = {
    gameLink: link,
    filesRevision: 0,
    documentsRevision: 0,
    addWorkerHangListener: (listener: (hang: WorkerHang) => void) => {
      hangListeners.add(listener);
      return () => {
        hangListeners.delete(listener);
      };
    },
    isSetAside: (point: PreviewPoint): boolean => setAsidePoints.has(point),
    previewCompile: async (params: any) => {
      const current = versions.get(params.textDocument.uri);
      if (current != null && current !== params.textDocument.version) {
        return { textDocument: params.textDocument, outdated: true };
      }
      return page.sendRequest(PreviewCompileProgramMessage.type, {
        ...params,
        root: { uri: MAIN_URI },
      });
    },
    programHeld: (program: string) =>
      (held = page
        .sendRequest(ProgramHeldMessage.type, { program })
        .then(() => undefined)),
    compileTextDocument: async () => {},
    selections: [] as any[],
    selectTextDocument: async (params: any) => {
      workspace.selections.push(params);
    },
  };
  setWorkspace(workspace as any);

  const refs: any = {
    viewport: win.document.createElement("div"),
    gameView: win.document.createElement("div"),
    gameUI: overlay,
    leftItems: win.document.createElement("div"),
    locationItems: win.document.createElement("div"),
    launchLabel: win.document.createElement("div"),
    connectionLabel: win.document.createElement("div"),
    executedLabel: win.document.createElement("div"),
    executionInfo: win.document.createElement("div"),
  };
  const host = win.document.createElement("div");
  win.document.body.append(host);
  const controller: any = new GamePlayerController(host, refs);
  controller._mounted = true;
  controller._stopHearingHangs = workspace.addWorkerHangListener(
    controller.handleWorkerHang,
  );
  const createImage = (): ImageTarget => createFakeImage(options.holdImage);
  const toRouter: any[] = [];
  let ui: UIManager | undefined;
  controller.ensureAudioContext = async () => {};
  controller.createApp = (endpoint: GameEndpoint) => {
    const stubApp = createStubApp(
      overlay,
      (message: any) => endpoint.receive(structuredClone(message)),
      createImage,
    );
    ui = new UIManager(stubApp);
    const managers = [ui, new AssetManager(stubApp), new SilentPageManager(stubApp)];
    const router = new MessageRouter(
      () => managers,
      (message) => endpoint.receive(structuredClone(message)),
    );
    let resolveInit!: () => void;
    const app = {
      initializing: new Promise<void>((resolve) => (resolveInit = resolve)),
      paused: false,
      clock: new Clock(
        {
          get currentTime() {
            return clock.now / 1000;
          },
        },
        (callback) => {
          clock.frames.push(callback);
          return clock.frames.length;
        },
      ),
      emit: (message: any) => endpoint.receive(structuredClone(message)),
      pause() {
        app.paused = true;
        for (const m of managers) m.onPause();
        app.clock.speed = 0;
      },
      unpause() {
        app.paused = false;
        for (const m of managers) m.onUnpause();
        app.clock.speed = 1;
      },
      skip(seconds: number) {
        app.clock.adjustTime(seconds);
        for (const m of managers) m.onSkip(seconds);
      },
      setAudioContext() {},
      started: false,
      start() {
        app.started = true;
        app.clock.start();
      },
      destroys: 0,
      destroyed: false,
      destroying: undefined as Promise<void> | undefined,
      destroy() {
        app.destroying ??= (async () => {
          app.destroyed = true;
          app.destroys += 1;
          router.disconnect();
          await app.initializing;
          app.clock.stop();
          app.clock.dispose();
          for (const m of managers) m.onDispose();
        })();
        return app.destroying;
      },
      connectGame: () =>
        endpoint.connect((message) => {
          const copy = structuredClone(message);
          if (recordMessages) toRouter.push(copy);
          router.receive(copy);
        }),
      async init() {
        try {
          await Promise.all(managers.map((m) => m.onInit()));
          await app.connectGame();
        } finally {
          resolveInit();
        }
      },
    };
    return app;
  };
  const playing = () => workerState.gameState.running;
  const toEditor: any[] = [];
  host.addEventListener("jsonrpc", (e: Event) => toEditor.push((e as CustomEvent).detail));

  return {
    controller,
    workspace,
    overlay,
    refs,
    get page() {
      return page;
    },
    link,
    get workerState() {
      return workerState;
    },
    stall() {
      page.closed = true;
    },
    async hang(busy: WorkerBusyParams) {
      page.closed = true;
      const hang = respondToWorkerHang(busy, {
        setAside: setAsidePoints,
        selected,
        listeners: hangListeners,
      });
      const stuck = page;
      const next = createWorker();
      page = next.page;
      workerState = next.workerState;
      link.reconnect(page);
      stuck.abandon(new CompilerRestartedError());
      await initialize(page);
      await settle();
      return hang;
    },
    toPage,
    onChannel,
    toEditor,
    toRouter,
    playing,
    async tick(ms = 1000 / 60, frames = 1) {
      for (let i = 0; i < frames; i++) {
        clock.now += ms;
        const waiting = clock.frames.splice(0);
        for (const frame of waiting) frame();
        await settle(4);
      }
    },
    recordPlays() {
      const played: any[] = [];
      const createGame = workerState.gameState.createGame;
      workerState.gameState.createGame = (gameOptions) => {
        if (workerState.gameState.game) {
          played.push(gameOptions.program);
        }
        return createGame(gameOptions);
      };
      return played;
    },
    snapshotDOM: () => serializeDOM(overlay),
    held: () => held,
    async compile(): Promise<any> {
      let result: CompiledProgramParams;
      try {
        result = await page.sendRequest(CompileProgramMessage.type, {
          textDocument: { uri: MAIN_URI },
          startFrom: selected,
        });
      } catch (e) {
        return { error: String((e as Error)?.message ?? e) };
      }
      result.program.version = ++programVersion;
      await controller.loadProgram(result.program);
      await settle();
      return result;
    },
    async edit(contentChanges: any[]) {
      const version = versions.get(MAIN_URI)! + 1;
      versions.set(MAIN_URI, version);
      await page.sendRequest(UpdateCompilerDocumentMessage.type, {
        textDocument: { uri: MAIN_URI, version },
        contentChanges,
      } as any);
      return version;
    },
    version: () => versions.get(MAIN_URI)!,
    async selectWithoutWaiting(line: number): Promise<{ previewed: Promise<void> }> {
      selected = { file: MAIN_URI, line };
      const result = await page.sendRequest(SelectCompilerDocumentMessage.type, {
        textDocument: { uri: MAIN_URI },
        selectedRange: { start: { line, character: 0 }, end: { line, character: 0 } },
        docChanged: false,
        userEvent: true,
      });
      return { previewed: controller.handleSelectedCompilerDocument({ params: result }) };
    },
    async select(line: number, uri = MAIN_URI): Promise<any> {
      selected = { file: uri, line };
      let result;
      try {
        result = await page.sendRequest(SelectCompilerDocumentMessage.type, {
          textDocument: { uri },
          selectedRange: { start: { line, character: 0 }, end: { line, character: 0 } },
          docChanged: false,
          userEvent: true,
        });
      } catch (e) {
        return { error: String((e as Error)?.message ?? e) };
      }
      await controller.handleSelectedCompilerDocument({ params: result });
      await settle();
      return result;
    },
    async suggest(contentChanges: any[] | null, line: number) {
      await controller.handlePreviewCompletion({
        params: {
          textDocument: { uri: MAIN_URI, version: versions.get(MAIN_URI)! },
          session: 1,
          request: ++completionRequest,
          state: "focus",
          contentChanges,
          selectedRange: { start: { line, character: 0 }, end: { line, character: 0 } },
        },
      });
      await settle(40);
    },
    async closeSuggestions() {
      await controller.handlePreviewCompletion({
        params: {
          textDocument: { uri: MAIN_URI, version: versions.get(MAIN_URI)! },
          session: 1,
          request: ++completionRequest,
          state: "close",
        },
      });
      await settle(40);
    },
    dispose() {
      setWorkspace(undefined as any);
      restore();
    },
  };
}
