import SparkdownScreenplayPreview from "@impower/sparkdown-document-views/src/modules/screenplay-preview/SparkdownScreenplayPreview";
import { useEffect, useRef, useState } from "preact/hooks";
import { editorAtSend } from "../../workspace/editorAtSend";
import workspaceSettings from "../../workspace/settings/WorkspaceSettings";
import workspace from "../../workspace/WorkspaceStore";
import type WorkspaceWindow from "../../workspace/WorkspaceWindow";

const scenesBeforeFor = async (uri: string) => {
  const { Workspace } = await import("../../workspace/Workspace");
  const { default: workspaceStore } = await import("../../workspace/WorkspaceStore");
  const { screenplayScenesBefore } = await import("../../workspace/utils/screenplayScenesBefore");
  const projectId = workspaceStore.state.value?.project?.id;
  if (!projectId) return 0;
  const files = await Workspace.fs.getFiles(projectId);
  return screenplayScenesBefore(Object.values(files), uri, (fileUri) => Workspace.fs.getRelativePath(projectId, fileUri));
};

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
  const [scenesBefore, setScenesBefore] = useState<Record<string, number>>({});

  const refreshScenesBefore = async () => {
    const { Workspace } = await import("../../workspace/Workspace");
    const uri = Workspace.window.getActiveEditorForPane("logic")?.uri;
    if (!uri) return;
    const count = await scenesBeforeFor(uri);
    setScenesBefore((current) => (current[uri] === count && Object.keys(current).length === 1 ? current : { [uri]: count }));
  };

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
      const { uri } = editor;
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
      void refreshScenesBefore();
      const current =
        editorAtSend(uri, () =>
          Workspace.window.getActiveEditorForPane("logic"),
        ) ?? editor;
      sendProtocolMessage(
        LoadPreviewMessage.type.request({
          type: "screenplay",
          textDocument: { uri, languageId, version, text },
          visibleRange: current.visibleRange,
          selectedRange: current.selectedRange,
          preserveEditor: Boolean(current.originalFilename),
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
      import(
        "@impower/spark-editor-protocol/src/protocols/workspace/DidRenameFilesMessage"
      ),
    ]).then(
      async ([
        { onProtocolMessage },
        { ConnectedPreviewMessage },
        { DidOpenTextDocumentMessage },
        { DidWriteFilesMessage },
        { DidDeleteFilesMessage },
        { DidRenameFilesMessage },
      ]) => {
        if (cancelled) return;
        const { Workspace } = await import("../../workspace/Workspace");
        const disposers = [
          onProtocolMessage(DidOpenTextDocumentMessage.type, () => {
            loadFile();
          }),
          onProtocolMessage(DidWriteFilesMessage.type, (m) => {
            const editor = Workspace.window.getActiveEditorForPane("logic");
            if (m.params.files.some((f) => f.uri !== editor?.uri)) {
              void refreshScenesBefore();
            }
            if (
              m.params.remote &&
              m.params.files.find((f) => f.uri === editor?.uri)
            ) {
              loadFile();
            }
          }),
          onProtocolMessage(DidDeleteFilesMessage.type, (m) => {
            const editor = Workspace.window.getActiveEditorForPane("logic");
            void refreshScenesBefore();
            if (m.params.files.find((f) => f.uri === editor?.uri)) {
              loadFile();
            }
          }),
          onProtocolMessage(DidRenameFilesMessage.type, () => {
            void refreshScenesBefore();
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
      const current =
        editorAtSend(editor.uri, () =>
          Workspace.window.getActiveEditorForPane("logic"),
        ) ?? editor;
      sendProtocolMessage(
        LoadPreviewMessage.type.request({
          type: "screenplay",
          textDocument: { uri: editor.uri, languageId, version, text },
          visibleRange: current.visibleRange,
          selectedRange: current.selectedRange,
          preserveEditor: Boolean(current.originalFilename),
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
          e.currentTarget.focus({ preventScroll: true });
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
          picks={game?.picks}
          scenesBefore={scenesBefore}
        />
      </div>
    </div>
  );
}
