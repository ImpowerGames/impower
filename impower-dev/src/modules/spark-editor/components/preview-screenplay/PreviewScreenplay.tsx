import SparkdownScreenplayPreview from "@impower/sparkdown-document-views/src/modules/screenplay-preview/SparkdownScreenplayPreview";
import { useEffect, useRef } from "preact/hooks";
import workspace from "../../workspace/WorkspaceStore";
import PreviewScreenplayToolbar from "../preview-screenplay-toolbar/PreviewScreenplayToolbar";

export const propDefaults = {};
export type PreviewScreenplayProps = Partial<typeof propDefaults>;

/**
 * Right-pane Screenplay preview. Renders the toolbar + the
 * SparkdownScreenplayPreview viewer (a Preact component imported directly
 * from sparkdown-document-views), and dispatches LoadPreviewMessage whenever
 * the active editor's file changes or the cache shifts.
 *
 * Mirrors the legacy <se-preview-screenplay> behavior: subscribes to
 * MessageProtocol for DidOpenTextDocument / DidWriteFiles / DidDeleteFiles
 * / ConnectedPreview, dedupes loads by (uri, version, text), and only
 * emits when something actually changed.
 */
export default function PreviewScreenplay(_props: PreviewScreenplayProps) {
  // Dedupe state — mirrors the legacy class's _uri/_version/_text fields.
  // Kept in refs because changes shouldn't trigger Preact re-renders.
  const lastUri = useRef<string | undefined>(undefined);
  const lastVersion = useRef<number | undefined>(undefined);
  const lastText = useRef<string | undefined>(undefined);

  // Subscribe to textPulledAt signal so we reload on sync pull.
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
            // The inner screenplay-preview attaches its window listener
            // asynchronously (Preact mount + dynamic import), so it may
            // miss our startup LoadPreviewMessage. Replay on ready —
            // reset the dedupe guard first so the resend goes through.
            lastUri.current = undefined;
            lastVersion.current = undefined;
            lastText.current = undefined;
            loadFile();
          }),
        ];
        disposeProtocol = () => disposers.forEach((d) => d());
        // Initial load
        loadFile();
      },
    );

    return () => {
      cancelled = true;
      disposeProtocol?.();
    };
  }, []);

  // Reload when textPulledAt changes (sync pulled new content from remote).
  useEffect(() => {
    if (!textPulledAt) return;
    // Reset dedupe to force a re-emit.
    lastUri.current = undefined;
    lastVersion.current = undefined;
    lastText.current = undefined;
    // Defer to next microtask so the handler in the other useEffect is
    // already wired.
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

  return (
    <>
      <PreviewScreenplayToolbar />
      <div class="relative flex flex-1 min-h-0">
        <div class="absolute inset-0 flex flex-col overflow-y-auto">
          <SparkdownScreenplayPreview scrollMargin="auto auto 60px auto" />
        </div>
      </div>
    </>
  );
}
