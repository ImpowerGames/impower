// The Game Preview end to end in one process: the player's controller on a
// jsdom page, the player's worker (`installPlayerWorker`) with its compiler and
// game, and between them a connection that delivers every message as a
// structured clone, one task after it was sent, in order, as a worker's port
// does. Only the pixi `Application` is replaced, by an application that routes
// the game's stream into the page's real managers the way `Application` does
// (`MessageRouter`), so the overlay DOM is the one the player builds.
//
// The same harness runs with the switch off (the worker sends the program and
// the page's game displays it) and on (the worker's game displays it), so a
// test can compare the two.
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
import { ProgramTransportDecoder } from "@impower/sparkdown/src/workspace/utils/programTransport";
import type { GameEndpoint } from "../../app/Application";
import type { ImageTarget } from "../../app/assets/AssetCache";
import { MessageRouter } from "../../app/MessageRouter";
import AssetManager from "../../app/managers/AssetManager";
import UIManager from "../../app/managers/UIManager";
import { GamePlayerController, setWorkspace } from "../../GamePlayerController";
import { installPlayerWorker } from "../../main/workers/installPlayerWorker";
import { ConfigurePlayerWorkerMessage } from "../../main/workers/messages/ConfigurePlayerWorkerMessage";
import { WorkerGameLink } from "../../main/workers/WorkerGameLink";
import {
  createFakeImage,
  createStubApp,
  installJSDOM,
  serializeDOM,
  SilentPageManager,
} from "../ui/domTestHarness";

export const MAIN_URI = "file:///local/main.sd";

/** One end of a port: what it posts arrives at its peer as a structured
 *  clone, one task later, in the order it was posted. */
export class LoopbackConnection extends MessageConnection {
  peer?: LoopbackConnection;

  protected _listeners = new Set<(e: MessageEvent) => void>();

  constructor(protected onPost?: (message: any) => void) {
    super((message) => this.deliver(message));
  }

  protected deliver(message: any) {
    const copy = structuredClone(message);
    this.onPost?.(copy);
    const peer = this.peer;
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

export const settle = async (tasks = 20) => {
  for (let i = 0; i < tasks; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

export interface PlayerHarnessOptions {
  workerDisplays: boolean;
  files: { uri: string; text: string }[];
  startFrom: { file: string; line: number };
  /** Decide when an image the page loads finishes; by default at once. */
  holdImage?: (src: string) => Promise<void> | undefined;
}

export async function createPlayerHarness(options: PlayerHarnessOptions) {
  const { win, overlay } = installJSDOM();
  // Everything the worker sends the page, as the page receives it.
  const toPage: any[] = [];
  const page = new LoopbackConnection();
  const worker = new LoopbackConnection((message) => toPage.push(message));
  page.peer = worker;
  worker.peer = page;
  const workerState = installPlayerWorker(worker);

  await page.sendRequest(CompilerInitializeMessage.type, { profilerId: "test" });
  await page.sendRequest(ConfigurePlayerWorkerMessage.type, {
    workerDisplaysPreview: options.workerDisplays,
  });
  const versions = new Map(options.files.map((f) => [f.uri, 1]));
  await page.sendRequest(ConfigureCompilerMessage.type, {
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

  // The page's side of the program transport, as `SparkdownWorkspace` keeps it.
  const decoder = new ProgramTransportDecoder();
  const decode = <R extends { program?: any }>(result: R): R => {
    if (result.program && !result.program.summary) {
      decoder.decode(result.program);
    }
    return result;
  };
  let programVersion = 0;
  let completionRequest = 0;
  let selected = options.startFrom;
  const link = new WorkerGameLink(page);
  const workspace = {
    workerDisplaysPreview: options.workerDisplays,
    gameLink: link,
    filesRevision: 0,
    previewCompile: async (params: any) => {
      const current = versions.get(params.textDocument.uri);
      if (current != null && current !== params.textDocument.version) {
        return { textDocument: params.textDocument, outdated: true };
      }
      return decode(
        await page.sendRequest(PreviewCompileProgramMessage.type, {
          ...params,
          root: { uri: MAIN_URI },
        }),
      );
    },
    compileForPlay: async () =>
      decode(
        await page.sendRequest(CompileProgramMessage.type, {
          textDocument: { uri: MAIN_URI },
          startFrom: selected,
          emitCompiledProgram: true,
        }),
      ),
    compileTextDocument: async () => {},
    selectTextDocument: async () => {},
  };
  setWorkspace(workspace as any);

  // The page's managers, and an application that connects them to either
  // game the way `Application` does.
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
  const createImage = (): ImageTarget => createFakeImage(options.holdImage);
  let ui: UIManager | undefined;
  controller.buildAppFor = async (endpoint: GameEndpoint) => {
    if (controller._app) {
      await controller._app.destroy(true);
    }
    const stubApp = createStubApp(
      overlay,
      (message: any) => endpoint.receive(structuredClone(message)),
      createImage,
    );
    ui = new UIManager(stubApp);
    const managers = [ui, new AssetManager(stubApp), new SilentPageManager(stubApp)];
    await Promise.all(managers.map((m) => m.onInit()));
    const router = new MessageRouter(
      () => managers,
      (message) => endpoint.receive(structuredClone(message)),
    );
    const app = {
      initializing: Promise.resolve(),
      paused: false,
      setAudioContext() {},
      start() {},
      destroy: async () => {
        router.disconnect();
        for (const m of managers) m.onDispose();
      },
      connectGame: () =>
        endpoint.connect((message) => router.receive(structuredClone(message))),
    };
    controller._app = app;
    await app.connectGame();
    return app;
  };
  // What the page relays to the editor.
  const toEditor: any[] = [];
  host.addEventListener("jsonrpc", (e: Event) => toEditor.push((e as CustomEvent).detail));

  return {
    controller,
    overlay,
    refs,
    page,
    link,
    workerState,
    toPage,
    toEditor,
    snapshotDOM: () => serializeDOM(overlay),
    /** Compile the main script and hand the result to the controller, as the
     *  workspace's `compiler/didCompile` does. */
    async compile(): Promise<any> {
      let result: CompiledProgramParams;
      try {
        result = decode(
          await page.sendRequest(CompileProgramMessage.type, {
            textDocument: { uri: MAIN_URI },
            startFrom: selected,
          }),
        );
      } catch (e) {
        // The worker answered the compile with an error, which the page's
        // workspace would log; the preview keeps what it shows.
        return { error: String((e as Error)?.message ?? e) };
      }
      result.program.version = ++programVersion;
      await controller.loadProgram(
        result.program,
        result.checkpoint,
        result.simulationFailure,
        result.simulatedPath,
        result.simulatedProgramId,
      );
      await settle();
      return result;
    },
    /** Edit the main script, as the editor's change notification does. */
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
    /** Select a line and answer once the selection has reached the
     *  controller, with the preview it started still under way. */
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
    /** Select a line, as the editor's cursor does. */
    async select(line: number): Promise<any> {
      selected = { file: MAIN_URI, line };
      let result;
      try {
        result = await page.sendRequest(SelectCompilerDocumentMessage.type, {
          textDocument: { uri: MAIN_URI },
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
    /** Highlight a suggestion that would make `contentChanges`, as the
     *  editor's `textDocument/previewCompletion` does, and wait until the
     *  preview has acted on it. */
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
    /** Close the suggestion list without accepting. */
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
    },
  };
}
