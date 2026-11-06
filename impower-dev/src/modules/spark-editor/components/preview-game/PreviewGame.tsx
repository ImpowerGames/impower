import { useEffect, useRef, useState } from "preact/hooks";
import workspaceSettings from "../../workspace/settings/WorkspaceSettings";
import { previewAspectRatioFor } from "../../workspace/previewAspectRatio";
import { createAspectRatioSync } from "./aspectRatioSync";
import { showSnackbar } from "../../utils/snackbar";
import { createPlayerPreferenceSync, playerUrl } from "./playerPreferences";
import PreviewGameToolbar from "../preview-game-toolbar/PreviewGameToolbar";
import { installPreviewInspector } from "./previewInspect";
import { createPreviewBeatSkipper } from "./previewBeatSkipper";

const SPARKDOWN_PLAYER_ORIGIN =
  import.meta.env.VITE_SPARKDOWN_PLAYER_ORIGIN || "";

const SAME_ORIGIN_PREVIEW = !!import.meta.env.VITE_SAME_ORIGIN_PREVIEW;
const PLAYER_CONTROLS = "?skip-buttons&step-buttons&host-display";
const PLAYER_SRC = SAME_ORIGIN_PREVIEW
  ? `/__player/${PLAYER_CONTROLS}`
  : `${SPARKDOWN_PLAYER_ORIGIN}/${PLAYER_CONTROLS}`;
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
  const [playerSrc] = useState(() => playerUrl(PLAYER_SRC));

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
      import("@impower/spark-editor-protocol/src/protocols/preview/ChangeStartingValuesMessage"),
      import("@impower/spark-editor-protocol/src/protocols/workspace/RuntimeDiagnosticsMessage"),
      import("@impower/spark-editor-protocol/src/protocols/preview/ChangeRoutePinsMessage"),
      import("@impower/spark-editor-protocol/src/protocols/preview/GameStateMessage"),
      import("@impower/spark-editor-protocol/src/protocols/preview/ListSavesMessage"),
      import("@impower/spark-editor-protocol/src/protocols/preview/WriteSaveMessage"),
      import("@impower/spark-editor-protocol/src/protocols/preview/RenameSaveMessage"),
      import("@impower/spark-editor-protocol/src/protocols/preview/DeleteSavesMessage"),
      import("@impower/spark-editor-protocol/src/protocols/preview/SkipBeatMessage"),
      import("@impower/spark-engine/src/game/core/classes/messages/FetchGameAssetMessage"),
      import("@impower/spark-engine/src/game/core/classes/messages/GameExecutedMessage"),
      import("@impower/spark-engine/src/game/core/classes/messages/GameEndedMessage"),
      import("@impower/spark-engine/src/game/core/classes/messages/GameExitedMessage"),
      import("@impower/spark-engine/src/game/core/classes/messages/GameResizedMessage"),
      import("@impower/spark-engine/src/game/core/classes/messages/GameStartedMessage"),
      import("@impower/spark-engine/src/game/core/classes/messages/GameWorkerRestartedMessage"),
      import("@impower/spark-engine/src/game/core/classes/messages/ResizeGameMessage"),
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
        { ChangeStartingValuesMessage },
        { RuntimeDiagnosticsMessage },
        { ChangeRoutePinsMessage },
        { DidChangeGameStateMessage },
        { ListSavesMessage },
        { WriteSaveMessage },
        { RenameSaveMessage },
        { DeleteSavesMessage },
        { SkipBeatMessage },
        { FetchGameAssetMessage },
        { GameExecutedMessage },
        { GameEndedMessage },
        { GameExitedMessage },
        { GameResizedMessage },
        { GameStartedMessage },
        { GameWorkerRestartedMessage },
        { ResizeGameMessage },
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
            startingValues: Workspace.window.startingValues,
          };
        };

        const skipBeat = createPreviewBeatSkipper({
          window: Workspace.window,
          ls: Workspace.ls,
        });

        const preferences = createPlayerPreferenceSync(
          (message) => iframeChannelRef.current?.postMessage(message),
          () => Workspace.window.getRoutePins(),
        );

        const aspectRatioSync = createAspectRatioSync(
          previewAspectRatioFor(workspaceSettings.projectSettings),
          (ratio) =>
            void iframeChannelRef.current?.sendRequest(ResizeGameMessage.type, {
              aspectRatio: ratio,
            }),
        );

        const onChannelMessage = async (e: MessageEvent) => {
          const message = e.data;
          preferences.received(message);
          if (ChangeStartingValuesMessage.type.isRequest(message)) {
            const { start, changes } = message.params;
            Workspace.window.changeStartingValues(start, changes);
            iframeChannelRef.current?.sendResponse(message, {});
            return;
          }
          if (ChangeRoutePinsMessage.type.isRequest(message)) {
            iframeChannelRef.current?.sendResponse(message, () => ({
              pins: Workspace.window.changeRoutePins(message.params),
            }));
            return;
          }
          if (ListSavesMessage.type.isRequest(message)) {
            iframeChannelRef.current?.sendResponse(message, async () => ({
              saves: await Workspace.window.previewSaves.list(),
            }));
            return;
          }
          if (WriteSaveMessage.type.isRequest(message)) {
            iframeChannelRef.current?.sendResponse(message, async () => {
              await Workspace.window.previewSaves.write(message.params.save);
              return {};
            });
            return;
          }
          if (RenameSaveMessage.type.isRequest(message)) {
            iframeChannelRef.current?.sendResponse(message, async () => {
              const { id, name } = message.params;
              await Workspace.window.previewSaves.rename(id, name);
              return {};
            });
            return;
          }
          if (DeleteSavesMessage.type.isRequest(message)) {
            iframeChannelRef.current?.sendResponse(message, async () => {
              await Workspace.window.previewSaves.delete(message.params.ids);
              return {};
            });
            return;
          }
          if (SkipBeatMessage.type.isRequest(message)) {
            iframeChannelRef.current?.sendResponse(message, async () => ({
              moved: await skipBeat(message.params.direction),
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
          aspectRatioSync.initialized();
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
          if (GameResizedMessage.type.isNotification(message)) {
            const { width, height, aspectRatio } = message.params;
            Workspace.window.syncGameSize({ width, height, aspectRatio });
          }
          if (GameExecutedMessage.type.is(message)) {
            const { executedLines, state, restarted } = message.params;
            const last = message.params.lastLocation;
            if (last) {
              Workspace.window.syncGamePosition({
                uri: last.uri,
                line: last.range.end.line,
              });
            }
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
          if (GameEndedMessage.type.is(message)) {
            Workspace.window.syncGameEnded(true);
          }
          if (DidChangeGameStateMessage.type.is(message)) {
            const { launchState, paused } = message.params;
            Workspace.window.syncGamePaused(paused);
            if (launchState === "ended") {
              Workspace.window.syncGameEnded(true);
            } else if (launchState === "play" || launchState === "pause") {
              Workspace.window.syncGameEnded(false);
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
                      void Workspace.window.revealDocument(
                        location.uri,
                        location.range,
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

        const onKeyDown = (e: KeyboardEvent) => {
          if (e.key !== "PageUp" && e.key !== "PageDown") return;
          void skipBeat(e.key === "PageUp" ? -1 : 1);
        };

        window.addEventListener(MessageProtocol.event, onProtocol);
        window.addEventListener("keydown", onKeyDown);

        onLoadRef.current = onLoad;
        iframeRef.current?.addEventListener("load", onLoad);
        if (loadedBeforeReadyRef.current) {
          loadedBeforeReadyRef.current = false;
          onLoad();
        }

        cleanup = () => {
          preferences.dispose();
          aspectRatioSync.dispose();
          window.removeEventListener(MessageProtocol.event, onProtocol);
          window.removeEventListener("keydown", onKeyDown);
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
      <div class="pg-iframe-wrap">
        <iframe
          ref={iframeRef}
          id="iframe"
          src={playerSrc}
          sandbox="allow-scripts allow-forms allow-same-origin"
          allow="autoplay"
          referrerpolicy="no-referrer"
          onLoad={() => {
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
