import SparkdownScreenplayPreview from "@impower/sparkdown-document-views/src/modules/screenplay-preview/SparkdownScreenplayPreview";
import { useEffect, useRef } from "preact/hooks";
import workspaceSettings from "../../workspace/settings/WorkspaceSettings";
import workspace from "../../workspace/WorkspaceStore";
import type WorkspaceWindow from "../../workspace/WorkspaceWindow";

const withWindow = async (act: (window: WorkspaceWindow) => unknown) => {
  const { Workspace } = await import("../../workspace/Workspace");
  act(Workspace.window);
};

export const propDefaults = {};
export type PreviewScreenplayProps = Partial<typeof propDefaults>;

export default function PreviewScreenplay(_props: PreviewScreenplayProps) {
  const lastUri = useRef<string | undefined>(undefined);
  const lastVersion = useRef<number | undefined>(undefined);
  const lastText = useRef<string | undefined>(undefined);

  const textPulledAt = workspace.state.value.sync?.textPulledAt || "";

  useEffect(() => {
    let disposeProtocol: (() => void) | undefined;
    let cancelled = false;

    const loadFile = async () => {
      const { Workspace } = await import("../../workspace/Workspace");
      const {
        default: workspaceStore,
      } = await import("../../workspace/WorkspaceStore");
      const { sendProtocolMessage } = await import(
        "@impower/spark-editor-protocol/src/protocols/MessageProtocol"
      );
      const { LoadPreviewMessage } = await import(
        "@impower/spark-editor-protocol/src/protocols/preview/LoadPreviewMessage"
      );
      const store = workspaceStore.state.value;
      const projectId = store?.project?.id;
      if (!projectId) return;
      const editor = Workspace.window.getActiveEditorForPane("logic");
      if (!editor) return;
      const { uri, visibleRange, selectedRange, originalFilename } = editor;
      const preserveEditor = Boolean(originalFilename);
      const files = await Workspace.fs.getFiles(projectId);
      const file = files[uri];
      const text = file?.text || "";
      const version = file?.version || 0;
      const languageId = file?.languageId || "sparkdown";
      if (cancelled) return;
      if (
        uri === lastUri.current &&
        version === lastVersion.current &&
        text === lastText.current
      ) {
        return;
      }
      lastUri.current = uri;
      lastVersion.current = version;
      lastText.current = text;
      sendProtocolMessage(
        LoadPreviewMessage.type.request({
          type: "screenplay",
          textDocument: { uri, languageId, version, text },
          visibleRange,
          selectedRange,
          preserveEditor,
        }),
      );
    };

    Promise.all([
      import("@impower/spark-editor-protocol/src/protocols/MessageProtocol"),
      import(
        "@impower/spark-editor-protocol/src/protocols/preview/ConnectedPreviewMessage"
      ),
      import(
        "@impower/spark-editor-protocol/src/protocols/textDocument/DidOpenTextDocumentMessage"
      ),
      import(
        "@impower/spark-editor-protocol/src/protocols/workspace/DidWriteFilesMessage"
      ),
      import(
        "@impower/spark-editor-protocol/src/protocols/workspace/DidDeleteFilesMessage"
      ),
    ]).then(
      async ([
        { onProtocolMessage },
        { ConnectedPreviewMessage },
        { DidOpenTextDocumentMessage },
        { DidWriteFilesMessage },
        { DidDeleteFilesMessage },
      ]) => {
        if (cancelled) return;
        const { Workspace } = await import("../../workspace/Workspace");
        const disposers = [
          onProtocolMessage(DidOpenTextDocumentMessage.type, () => {
            loadFile();
          }),
          onProtocolMessage(DidWriteFilesMessage.type, (m) => {
            const editor = Workspace.window.getActiveEditorForPane("logic");
            if (
              m.params.remote &&
              m.params.files.find((f) => f.uri === editor?.uri)
            ) {
              loadFile();
            }
          }),
          onProtocolMessage(DidDeleteFilesMessage.type, (m) => {
            const editor = Workspace.window.getActiveEditorForPane("logic");
            if (m.params.files.find((f) => f.uri === editor?.uri)) {
              loadFile();
            }
          }),
          onProtocolMessage(ConnectedPreviewMessage.type, () => {
            lastUri.current = undefined;
            lastVersion.current = undefined;
            lastText.current = undefined;
            loadFile();
          }),
        ];
        disposeProtocol = () => disposers.forEach((d) => d());
        loadFile();
      },
    );

    return () => {
      cancelled = true;
      disposeProtocol?.();
    };
  }, []);

  useEffect(() => {
    if (!textPulledAt) return;
    lastUri.current = undefined;
    lastVersion.current = undefined;
    lastText.current = undefined;
    queueMicrotask(async () => {
      const { Workspace } = await import("../../workspace/Workspace");
      const { sendProtocolMessage } = await import(
        "@impower/spark-editor-protocol/src/protocols/MessageProtocol"
      );
      const { LoadPreviewMessage } = await import(
        "@impower/spark-editor-protocol/src/protocols/preview/LoadPreviewMessage"
      );
      const {
        default: workspaceStore,
      } = await import("../../workspace/WorkspaceStore");
      const store = workspaceStore.state.value;
      const projectId = store?.project?.id;
      if (!projectId) return;
      const editor = Workspace.window.getActiveEditorForPane("logic");
      if (!editor) return;
      const files = await Workspace.fs.getFiles(projectId);
      const file = files[editor.uri];
      const text = file?.text || "";
      const version = file?.version || 0;
      const languageId = file?.languageId || "sparkdown";
      lastUri.current = editor.uri;
      lastVersion.current = version;
      lastText.current = text;
      sendProtocolMessage(
        LoadPreviewMessage.type.request({
          type: "screenplay",
          textDocument: { uri: editor.uri, languageId, version, text },
          visibleRange: editor.visibleRange,
          selectedRange: editor.selectedRange,
          preserveEditor: Boolean(editor.originalFilename),
        }),
      );
    });
  }, [textPulledAt]);

  const preferences = workspaceSettings.preferences.value;
  const game = workspace.state.value.preview?.modes?.game;
  const playing = !!game?.running && !game?.ended;

  return (
    <div
      role="region"
      aria-label="Screenplay"
      tabIndex={0}
      data-playing={playing ? "" : undefined}
      class="relative flex flex-1 min-h-0 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent"
      onMouseDownCapture={(e) => {
        if (playing) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onClick={() => {
        if (playing) {
          void withWindow((window) => window.continueGame());
        }
      }}
      onKeyDown={(e) => {
        if (playing && e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          void withWindow((window) => window.continueGame());
        }
      }}
    >
      <div class="absolute inset-0 flex flex-col overflow-y-auto">
        <SparkdownScreenplayPreview
          scrollMargin="auto auto 60px auto"
          config={workspaceSettings.screenplayConfig.value}
          paper={preferences.screenplayPaper}
          texture={preferences.screenplayPaperTexture}
          syncScroll={preferences.previewScreenplaySync}
          playing={playing}
          executedLines={workspace.state.value.debug?.highlights}
        />
      </div>
    </div>
  );
}
