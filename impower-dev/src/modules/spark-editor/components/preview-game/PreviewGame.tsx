import { useEffect, useRef } from "preact/hooks";
import type { SparkProgram } from "../../../../../../packages/sparkdown/src/compiler/types/SparkProgram";
import PreviewGameToolbar from "../preview-game-toolbar/PreviewGameToolbar";
import { installPreviewInspector } from "./previewInspect";

const SPARKDOWN_PLAYER_ORIGIN =
  import.meta.env.VITE_SPARKDOWN_PLAYER_ORIGIN || "";

// DEV-ONLY same-origin preview. When VITE_SAME_ORIGIN_PREVIEW is set, the editor
// dev server proxies the player under our own origin at /__player/ (see
// impower-dev/build.ts), so we embed it as a SAME-ORIGIN iframe and address it
// via our own origin. This makes the live game DOM reachable from this page
// (document.querySelector('#iframe').contentDocument) and devtools. Defaults
// OFF: the player stays a cross-origin iframe at VITE_SPARKDOWN_PLAYER_ORIGIN.
const SAME_ORIGIN_PREVIEW = !!import.meta.env.VITE_SAME_ORIGIN_PREVIEW;
const PLAYER_SRC = SAME_ORIGIN_PREVIEW ? "/__player/" : `${SPARKDOWN_PLAYER_ORIGIN}/`;
// Guard `window`: this module is also evaluated during the editor's SSG render
// (server-side, no `window`). The target origin is only needed at runtime in the
// browser. Same-origin posts match the iframe's origin with or without an
// explicit targetOrigin, so an SSR-time "" is harmless.
const PLAYER_TARGET_ORIGIN = SAME_ORIGIN_PREVIEW
  ? typeof window !== "undefined"
    ? window.location.origin
    : ""
  : SPARKDOWN_PLAYER_ORIGIN;

export const propDefaults = {};
export type PreviewGameProps = Partial<typeof propDefaults>;

// Iframe wrap styling lives here so the iframe can fill the available
// vertical space — Tailwind can't trivially express the `pointer-events:
// auto` opt-in over sparkle's universal `* { pointer-events: none }`
// reset without re-declaring it as an inlined rule.
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

// Pure helpers — extracted from legacy class so the Preact component
// stays compact. Find the previous/next source-position entry from a
// SparkProgram given the current file + line.

function getClosestSourceIndex(
  allFiles: string[],
  allPathToLocationEntries: [
    string,
    [number, number, number, number, number],
  ][],
  currentFile: string | undefined,
  currentLine: number,
): number | null {
  if (currentFile == null) return null;
  const fileIndex = allFiles.indexOf(currentFile);
  if (fileIndex < 0) return null;
  let closestIndex: number | null = null;
  for (let i = 0; i < allPathToLocationEntries.length; i++) {
    const entry = allPathToLocationEntries[i]!;
    const [, source] = entry;
    if (source) {
      const [currFileIndex, currStartLine] = source;
      if (currFileIndex === fileIndex && currStartLine === currentLine) {
        closestIndex = i;
        break;
      }
      if (currFileIndex === fileIndex && currStartLine > currentLine) {
        closestIndex = i - 1;
        break;
      }
      if (currFileIndex > fileIndex) {
        closestIndex = null;
        break;
      }
    }
  }
  return closestIndex;
}

function getOffsetSource(
  program: SparkProgram,
  currentFile: string | undefined,
  currentLine: number,
  offset: number,
): { file: string; line: number } | null | undefined {
  if (!program) return undefined;
  const files = Object.keys(program.scripts);
  const pathLocationEntries = Object.entries(
    program.pathLocations || {},
  ) as [string, [number, number, number, number, number]][];
  const index = getClosestSourceIndex(
    files,
    pathLocationEntries,
    currentFile,
    currentLine,
  );
  if (index == null) return null;
  const entry = pathLocationEntries[index + offset];
  if (entry == null) return null;
  const [uuid, source] = entry;
  if (uuid == null) return null;
  const [fileIndex, lineIndex] = source;
  const file = files[fileIndex];
  if (!file) return null;
  return { file, line: lineIndex };
}

/**
 * Right-pane Game preview. Hosts an `<iframe>` pointed at the sparkdown
 * player and brokers messages between the editor and the player via a
 * MessagePort channel. Mirrors the legacy <se-preview-game>:
 *
 *   - On iframe `load`: open a Port1MessageConnection over a new
 *     MessageChannel and Initialize the player with project files, LSP
 *     settings, builtin/optional/schema/description definitions, and the
 *     game configuration (workspace + startFrom + simulationOptions).
 *   - Forward messages from the editor (game/preview/workspace/text-
 *     Document/*) into the iframe channel.
 *   - Forward incoming iframe messages back into the editor's global
 *     MessageProtocol event stream, plus special-case Game lifecycle
 *     events (Started/Executed/Exited/ToggledFullscreenMode), file-read
 *     proxies, and ExecuteCommand RPC.
 *   - PageUp/PageDown traverse program source positions.
 *
 * (The legacy "resizing"/"resized" window listeners that pinned iframe
 * pointer-events during a split-pane drag are gone: the port's SplitPane
 * captures the pointer on its divider (`setPointerCapture`), so a drag over
 * the iframe is no longer swallowed and no pinning is needed.)
 *
 * Renders the (Preact) PreviewGameToolbar above the iframe via the
 * <se-preview-game-toolbar> custom-element tag — that's now backed by
 * the Preact PreviewGameToolbar.
 */
export default function PreviewGame(_props: PreviewGameProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  // Channel lifecycle: a MessageChannel + Port1MessageConnection bound to
  // the iframe's window. Stored in a ref so cleanup can tear it down and
  // so the `protocol` and load handlers can reach the same instance
  // without re-creating it across renders.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const iframeChannelRef = useRef<any>(null);
  const initializedRef = useRef(false);
  const initializingResolveRef = useRef<(() => void) | null>(null);
  const initializingRef = useRef<Promise<void>>(
    new Promise<void>((res) => {
      initializingResolveRef.current = res;
    }),
  );

  // onLoad handler shared between the JSX `onLoad` (which can fire
  // before our useEffect attaches a listener — iframe loads fast) and
  // the useEffect itself. Stored in a ref so the JSX handler always
  // calls the latest version after lazy imports complete.
  const onLoadRef = useRef<(() => void) | null>(null);
  // Track if load fired before our effect set up the handler. If so,
  // we trigger it once the handler becomes available.
  const loadedBeforeReadyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    // DEV-ONLY: when the preview is same-origin, expose `window.__preview` so the
    // live game DOM is inspectable from the console / automation. No-op (and not
    // installed) when embedding cross-origin, where frame access would be blocked.
    const uninstallInspector = SAME_ORIGIN_PREVIEW
      ? installPreviewInspector()
      : undefined;

    Promise.all([
      import("@impower/jsonrpc/src/browser/classes/IFrameMessageConnection"),
      import("@impower/jsonrpc/src/browser/classes/Port1MessageConnection"),
      import(
        "@impower/spark-editor-protocol/src/protocols/editor/ChangedEditorBreakpointsMessage"
      ),
      import(
        "@impower/spark-editor-protocol/src/protocols/editor/ChangedEditorPinpointsMessage"
      ),
      import("@impower/spark-editor-protocol/src/protocols/InitializeMessage"),
      import("@impower/spark-editor-protocol/src/protocols/MessageProtocol"),
      import(
        "@impower/spark-editor-protocol/src/protocols/workspace/ExecuteCommandMessage"
      ),
      import(
        "@impower/spark-engine/src/game/core/classes/messages/EnterGameFullscreenModeMessage"
      ),
      import(
        "@impower/spark-engine/src/game/core/classes/messages/ExitGameFullscreenModeMessage"
      ),
      import(
        "@impower/spark-engine/src/game/core/classes/messages/FetchGameAssetMessage"
      ),
      import(
        "@impower/spark-engine/src/game/core/classes/messages/GameExecutedMessage"
      ),
      import(
        "@impower/spark-engine/src/game/core/classes/messages/GameExitedMessage"
      ),
      import(
        "@impower/spark-engine/src/game/core/classes/messages/GameStartedMessage"
      ),
      import(
        "@impower/spark-engine/src/game/core/classes/messages/GameToggledFullscreenModeMessage"
      ),
      import(
        "@impower/spark-engine/src/game/modules/DEFAULT_BUILTIN_DEFINITIONS"
      ),
      import(
        "@impower/spark-engine/src/game/modules/DEFAULT_DESCRIPTION_DEFINITIONS"
      ),
      import(
        "@impower/spark-engine/src/game/modules/DEFAULT_OPTIONAL_DEFINITIONS"
      ),
      import(
        "@impower/spark-engine/src/game/modules/DEFAULT_SCHEMA_DEFINITIONS"
      ),
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
        { EnterGameFullscreenModeMessage },
        { ExitGameFullscreenModeMessage },
        { FetchGameAssetMessage },
        { GameExecutedMessage },
        { GameExitedMessage },
        { GameStartedMessage },
        { GameToggledFullscreenModeMessage },
        { DEFAULT_BUILTIN_DEFINITIONS },
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
            simulationOptions:
              Workspace.window.store.debug.simulationOptions,
          };
        };

        const onChannelMessage = async (e: MessageEvent) => {
          const message = e.data;
          if (ExecuteCommandMessage.type.is(message)) {
            const result = await Workspace.fs.executeCommand(message.params);
            iframeChannelRef.current?.sendResponse(message, result);
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
          // Forward messages from iframe → editor's global event stream.
          sendProtocolMessage(message);
        };

        let setupInFlight = false;
        const onLoad = async () => {
          const iframe = iframeRef.current;
          if (!iframe) return;
          // Idempotent — the JSX onLoad and the addEventListener will both
          // fire for the same iframe load, but we only want one channel.
          // Also covers the rare case where load fires twice (iframe.src
          // reset, etc.) by tearing down the previous channel first.
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
                builtins: DEFAULT_BUILTIN_DEFINITIONS,
                optionals: DEFAULT_OPTIONAL_DEFINITIONS,
                schemas: DEFAULT_SCHEMA_DEFINITIONS,
                descriptions: DEFAULT_DESCRIPTION_DEFINITIONS,
              },
              skipValidation: true,
              uri,
              workspace: projectPath,
              ...getGameConfiguration(),
            },
            capabilities: {},
            workspaceFolders: [{ uri: projectPath, name: "Project" }],
          });
          initializedRef.current = true;
          initializingResolveRef.current?.();
          setupInFlight = false;
        };

        // Stays a raw bus listener (not the typed `onProtocolMessage` helper): its
        // primary job is a generic method-prefix relay — forward ANY
        // game/preview/workspace/textDocument message to the iframe — which
        // a type-keyed handler can't express. The specific lifecycle checks
        // below share this one handler so they stay sequenced after the
        // (awaited) forward.
        const onProtocol = async (e: Event) => {
          if (!(e instanceof CustomEvent)) return;
          const message = e.detail;

          // Forward editor → iframe for game/preview/workspace/textDocument
          if (
            typeof message.method === "string" &&
            (message.method.startsWith("game/") ||
              message.method.startsWith("preview/") ||
              message.method.startsWith("workspace/") ||
              message.method.startsWith("textDocument/"))
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
            const {
              locations,
              state,
              restarted,
              simulatePath,
              conditions,
              choices,
            } = message.params;
            if (simulatePath) {
              const favoredConditions = conditions.map(
                (c: { selected: unknown }) => c.selected,
              );
              const favoredChoices = choices.map(
                (c: { selected: unknown }) => c.selected,
              );
              Workspace.window.setSimulationOptions(simulatePath, {
                favoredConditions,
                favoredChoices,
              });
            }
            const executedSets: Record<string, Set<number>> = {};
            for (const location of locations) {
              executedSets[location.uri] ??= new Set();
              for (
                let i = location.range.start.line;
                i <= location.range.end.line;
                i++
              ) {
                executedSets[location.uri]?.add(i);
              }
            }
            const executedMap: Record<string, number[]> = {};
            for (const [uri, set] of Object.entries(executedSets)) {
              executedMap[uri] = Array.from(set);
            }
            Workspace.window.setHighlights(executedMap);
            if (state === "running" && !restarted) {
              const editor = Workspace.window.getActiveEditorForPane("logic");
              if (editor) {
                const { uri } = editor;
                const currentDocExecutedLines = executedMap[uri];
                const lastExecutedLine =
                  currentDocExecutedLines?.at(-1);
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
          }
          if (ChangedEditorBreakpointsMessage.type.is(message)) {
            // TODO: forward breakpoints to player
          }
          if (ChangedEditorPinpointsMessage.type.is(message)) {
            // TODO: forward pinpoints to player
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
          const program = await Workspace.ls.getProgram();
          if (!program) return;
          const { uri, selectedRange } = editor;
          const currLine = selectedRange?.start.line ?? 0;
          const target =
            e.key === "PageUp"
              ? getOffsetSource(program, uri, currLine, -1)
              : getOffsetSource(program, uri, currLine, 1);
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

        // Wire the onLoad handler. Also catch the case where the
        // iframe loaded BEFORE this effect ran (likely — iframe loads
        // fast, useEffect is async) by triggering onLoad once.
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
          // Hide iframe until its document loads so we don't briefly see
          // the sparkdown-player's pre-init flash.
          style={{ visibility: "hidden" }}
          onLoad={(e) => {
            (e.currentTarget as HTMLIFrameElement).style.visibility = "visible";
            // If useEffect already set up the channel handler, call it
            // now. Otherwise mark that load fired before we were ready —
            // the effect will trigger it once it runs.
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
