import { useEffect, useRef } from "preact/hooks";
import { showSnackbar } from "../../utils/snackbar";
import { createPlayerPreferenceSync } from "./playerPreferences";
import PreviewGameToolbar from "../preview-game-toolbar/PreviewGameToolbar";
import { installPreviewInspector } from "./previewInspect";

const SPARKDOWN_PLAYER_ORIGIN =
  import.meta.env.VITE_SPARKDOWN_PLAYER_ORIGIN || "";

const SAME_ORIGIN_PREVIEW = !!import.meta.env.VITE_SAME_ORIGIN_PREVIEW;
const PLAYER_SRC = SAME_ORIGIN_PREVIEW
  ? "/__player/"
  : `${SPARKDOWN_PLAYER_ORIGIN}/`;
const PLAYER_TARGET_ORIGIN = SAME_ORIGIN_PREVIEW
  ? typeof window !== "undefined"
    ? window.location.origin
    : ""
  : SPARKDOWN_PLAYER_ORIGIN;

export const propDefaults = {};
export type PreviewGameProps = Partial<typeof propDefaults>;

const STYLE = `
  .pg-iframe-wrap {
    position: relative;
    display: flex;
    flex: 1;
  }
  .pg-iframe-wrap > iframe {
    width: 100%;
    height: 100%;
    border: 0;
    pointer-events: auto;
  }
`;

export default function PreviewGame(_props: PreviewGameProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const iframeChannelRef = useRef<any>(null);
  const initializedRef = useRef(false);
  const initializingResolveRef = useRef<(() => void) | null>(null);
  const initializingRef = useRef<Promise<void>>(
    new Promise<void>((res) => {
      initializingResolveRef.current = res;
    }),
  );

  const onLoadRef = useRef<(() => void) | null>(null);
  const loadedBeforeReadyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    const uninstallInspector = SAME_ORIGIN_PREVIEW
      ? installPreviewInspector()
      : undefined;

    Promise.all([
      import("@impower/jsonrpc/src/browser/classes/IFrameMessageConnection"),
      import("@impower/jsonrpc/src/browser/classes/Port1MessageConnection"),
      import("@impower/spark-editor-protocol/src/protocols/editor/ChangedEditorBreakpointsMessage"),
      import("@impower/spark-editor-protocol/src/protocols/editor/ChangedEditorPinpointsMessage"),
      import("@impower/spark-editor-protocol/src/protocols/InitializeMessage"),
      import("@impower/spark-editor-protocol/src/protocols/MessageProtocol"),
      import("@impower/spark-editor-protocol/src/protocols/workspace/ExecuteCommandMessage"),
      import("@impower/spark-editor-protocol/src/protocols/workspace/RuntimeDiagnosticsMessage"),
      import("@impower/spark-editor-protocol/src/protocols/preview/ChangeRoutePinsMessage"),
      import("@impower/spark-engine/src/game/core/classes/messages/EnterGameFullscreenModeMessage"),
      import("@impower/spark-engine/src/game/core/classes/messages/ExitGameFullscreenModeMessage"),
      import("@impower/spark-engine/src/game/core/classes/messages/FetchGameAssetMessage"),
      import("@impower/spark-engine/src/game/core/classes/messages/GameExecutedMessage"),
      import("@impower/spark-engine/src/game/core/classes/messages/GameExitedMessage"),
      import("@impower/spark-engine/src/game/core/classes/messages/GameStartedMessage"),
      import("@impower/spark-engine/src/game/core/classes/messages/GameToggledFullscreenModeMessage"),
      import("@impower/spark-engine/src/game/core/classes/messages/GameWorkerRestartedMessage"),
      import("@impower/spark-engine/src/game/core/utils/executedLineRanges"),
      import("@impower/spark-engine/src/game/modules/DEFAULT_DESCRIPTION_DEFINITIONS"),
      import("@impower/spark-engine/src/game/modules/DEFAULT_OPTIONAL_DEFINITIONS"),
      import("@impower/spark-engine/src/game/modules/DEFAULT_SCHEMA_DEFINITIONS"),
      import("../../workspace/Workspace"),
    ]).then(
      async ([
        { IFrameMessageConnection },
        { Port1MessageConnection },
        { ChangedEditorBreakpointsMessage },
        { ChangedEditorPinpointsMessage },
        { InitializeMessage },
        { MessageProtocol, sendProtocolMessage },
        { ExecuteCommandMessage },
        { RuntimeDiagnosticsMessage },
        { ChangeRoutePinsMessage },
        { EnterGameFullscreenModeMessage },
        { ExitGameFullscreenModeMessage },
        { FetchGameAssetMessage },
        { GameExecutedMessage },
        { GameExitedMessage },
        { GameStartedMessage },
        { GameToggledFullscreenModeMessage },
        { GameWorkerRestartedMessage },
        { expandLineRanges },
        { DEFAULT_DESCRIPTION_DEFINITIONS },
        { DEFAULT_OPTIONAL_DEFINITIONS },
        { DEFAULT_SCHEMA_DEFINITIONS },
        { Workspace },
      ]) => {
        if (cancelled) return;

        const getGameConfiguration = () => {
          const editor = Workspace.window.getActiveEditorForPane("logic");
          if (!editor) return {};
          const { uri, selectedRange } = editor;
          const startLine = selectedRange?.start?.line ?? 0;
          return {
            workspace: Workspace.window.store.project.directory,
            startFrom: { file: uri, line: startLine },
          };
        };

        const preferences = createPlayerPreferenceSync(
          (message) => iframeChannelRef.current?.postMessage(message),
          () => Workspace.window.getRoutePins(),
        );

        const onChannelMessage = async (e: MessageEvent) => {
          const message = e.data;
          preferences.received(message);
          if (ChangeRoutePinsMessage.type.isRequest(message)) {
            iframeChannelRef.current?.sendResponse(message, () => ({
              pins: Workspace.window.changeRoutePins(message.params),
            }));
            return;
          }
          if (ExecuteCommandMessage.type.is(message)) {
            const result = await Workspace.fs.executeCommand(message.params);
            iframeChannelRef.current?.sendResponse(message, result);
          }
          if (RuntimeDiagnosticsMessage.type.isNotification(message)) {
            Workspace.ls.connection.sendNotification(
              RuntimeDiagnosticsMessage.method,
              message.params,
            );
          }
          if (FetchGameAssetMessage.type.is(message)) {
            const { path } = message.params;
            const uri = Workspace.fs.getUriFromPath(path);
            const buffer = await Workspace.fs.readFile({ file: { uri } });
            iframeChannelRef.current?.sendResponse(
              message,
              { transfer: [buffer] },
              [buffer],
            );
          }
          sendProtocolMessage(message);
        };

        let setupInFlight = false;
        const onLoad = async () => {
          const iframe = iframeRef.current;
          if (!iframe) return;
          if (setupInFlight) return;
          setupInFlight = true;
          if (iframeChannelRef.current) {
            iframeChannelRef.current.removeEventListener?.(
              "message",
              onChannelMessage,
            );
          }
          if (!PLAYER_TARGET_ORIGIN) {
            console.error("no target origin specified");
          }
          const channel = new MessageChannel();
          const iframeWindowConnection = new IFrameMessageConnection(
            iframe,
            PLAYER_TARGET_ORIGIN,
          );
          const connection = new Port1MessageConnection(channel.port1);
          iframeChannelRef.current = connection;
          await connection.connect(iframeWindowConnection, channel.port2);
          connection.addEventListener("message", onChannelMessage);
          const projectId = Workspace.window.store.project.id;
          if (!projectId) {
            console.error("No project loaded");
            return;
          }
          const files = await Workspace.fs.getFiles(projectId);
          const uri = Workspace.window.getOpenedDocumentUri();
          const projectPath = await Workspace.fs.getDirectoryUri(projectId);
          await connection.sendRequest(InitializeMessage.type, {
            rootUri: projectPath,
            processId: 0,
            initializationOptions: {
              settings: Workspace.configuration.settings,
              files: Object.values(files),
              definitions: {
                optionals: DEFAULT_OPTIONAL_DEFINITIONS,
                schemas: DEFAULT_SCHEMA_DEFINITIONS,
                descriptions: DEFAULT_DESCRIPTION_DEFINITIONS,
              },
              skipValidation: true,
              stripImageData: true,
              uriPathsAsWritten: true,
              uri,
              workspace: projectPath,
              ...getGameConfiguration(),
            },
            capabilities: {},
            workspaceFolders: [{ uri: projectPath, name: "Project" }],
          });
          preferences.initialized();
          initializedRef.current = true;
          initializingResolveRef.current?.();
          setupInFlight = false;
        };

        const onProtocol = async (e: Event) => {
          if (!(e instanceof CustomEvent)) return;
          const message = e.detail;

          if (
            typeof message.method === "string" &&
            !("result" in message) && !("error" in message) &&
            (message.method.startsWith("game/") ||
              message.method.startsWith("preview/") ||
              (message.method.startsWith("workspace/") && !("id" in message)) ||
              (message.method.startsWith("textDocument/") &&
                !("id" in message) &&
                message.method !== "textDocument/didSave"))
          ) {
            if (!initializedRef.current) {
              await initializingRef.current;
            }
            iframeChannelRef.current?.postMessage(message);
          }

          if (GameStartedMessage.type.is(message)) {
            Workspace.window.startGame();
          }
          if (GameToggledFullscreenModeMessage.type.is(message)) {
            if (document.fullscreenElement) {
              document.exitFullscreen();
            } else {
              previewRef.current?.requestFullscreen();
            }
          }
          if (GameExecutedMessage.type.is(message)) {
            const { executedLines, state, restarted } = message.params;
            const executedMap: Record<string, number[]> = {};
            for (const [uri, lines] of Object.entries(executedLines ?? {})) {
              executedMap[uri] = expandLineRanges(lines.ranges);
            }
            Workspace.window.setHighlights(executedMap);
            if (state === "running" && !restarted) {
              const editor = Workspace.window.getActiveEditorForPane("logic");
              if (editor) {
                const { uri } = editor;
                const lastExecutedLine = executedLines?.[uri]?.last;
                if (lastExecutedLine != null) {
                  Workspace.window.showDocument(
                    uri,
                    {
                      start: { line: lastExecutedLine, character: 0 },
                      end: { line: lastExecutedLine, character: 0 },
                    },
                    false,
                  );
                }
              }
            }
          }
          if (GameExitedMessage.type.is(message)) {
            Workspace.window.setHighlights({});
            Workspace.window.endGame();
          }
          if (GameWorkerRestartedMessage.type.isNotification(message)) {
            const { location } = message.params;
            showSnackbar({
              message: message.params.message,
              ...(location
                ? {
                    actionLabel: "Show line",
                    onAction: () => {
                      Workspace.window.showDocument(
                        location.uri,
                        location.range,
                        true,
                      );
                    },
                  }
                : {}),
            });
          }
          if (ChangedEditorBreakpointsMessage.type.is(message)) {
          }
          if (ChangedEditorPinpointsMessage.type.is(message)) {
          }
        };

        const onFullscreenChange = async () => {
          if (!initializedRef.current) return;
          if (document.fullscreenElement) {
            await iframeChannelRef.current?.sendRequest(
              EnterGameFullscreenModeMessage.type,
              {},
            );
          } else {
            await iframeChannelRef.current?.sendRequest(
              ExitGameFullscreenModeMessage.type,
              {},
            );
          }
        };

        const onKeyDown = async (e: KeyboardEvent) => {
          const editor = Workspace.window.getActiveEditorForPane("logic");
          if (!editor) return;
          if (e.key !== "PageUp" && e.key !== "PageDown") return;
          const { uri, selectedRange } = editor;
          const currLine = selectedRange?.start.line ?? 0;
          const target = await Workspace.ls.getOffsetSourceLocation(
            uri,
            currLine,
            e.key === "PageUp" ? -1 : 1,
          );
          if (target && target.file === uri) {
            Workspace.window.showDocument(
              uri,
              {
                start: { line: target.line, character: 0 },
                end: { line: target.line, character: 0 },
              },
              true,
            );
          }
        };

        window.addEventListener(MessageProtocol.event, onProtocol);
        window.addEventListener("keydown", onKeyDown);
        document.addEventListener("fullscreenchange", onFullscreenChange);

        onLoadRef.current = onLoad;
        iframeRef.current?.addEventListener("load", onLoad);
        if (loadedBeforeReadyRef.current) {
          loadedBeforeReadyRef.current = false;
          onLoad();
        }

        cleanup = () => {
          window.removeEventListener(MessageProtocol.event, onProtocol);
          window.removeEventListener("keydown", onKeyDown);
          document.removeEventListener("fullscreenchange", onFullscreenChange);
          iframeRef.current?.removeEventListener("load", onLoad);
          onLoadRef.current = null;
          iframeChannelRef.current?.removeEventListener?.(
            "message",
            onChannelMessage,
          );
        };
      },
    );

    return () => {
      cancelled = true;
      cleanup?.();
      uninstallInspector?.();
    };
  }, []);

  return (
    <>
      <style>{STYLE}</style>
      <PreviewGameToolbar />
      <div ref={previewRef} class="pg-iframe-wrap" id="preview">
        <iframe
          ref={iframeRef}
          id="iframe"
          src={PLAYER_SRC}
          sandbox="allow-scripts allow-forms allow-same-origin"
          allow="autoplay"
          referrerpolicy="no-referrer"
          style={{ visibility: "hidden" }}
          onLoad={(e) => {
            (e.currentTarget as HTMLIFrameElement).style.visibility = "visible";
            if (onLoadRef.current) {
              onLoadRef.current();
            } else {
              loadedBeforeReadyRef.current = true;
            }
          }}
        />
      </div>
    </>
  );
}
