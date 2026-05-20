import { useEffect, useRef } from "preact/hooks";
import workspace from "../../workspace/WorkspaceStore";
import PreviewScreenplayToolbar from "../preview-screenplay-toolbar/PreviewScreenplayToolbar";

export const propDefaults = {};
export type PreviewScreenplayProps = Partial<typeof propDefaults>;

// `display: flex` host so the toolbar (sticky-top) + viewer (grow) stack
// correctly inside the Preview pane's wrapper.
const HOST_STYLE = `
  se-preview-screenplay {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
  }
`;

/**
 * Right-pane Screenplay preview. Renders the toolbar + the
 * `<sparkdown-screenplay-preview>` viewer (a Preact-custom-element from
 * sparkdown-document-views), and dispatches LoadPreviewMessage whenever
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
      const { MessageProtocol } = await import(
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
      window.dispatchEvent(
        new CustomEvent(MessageProtocol.event, {
          detail: LoadPreviewMessage.type.request({
            type: "screenplay",
            textDocument: { uri, languageId, version, text },
            visibleRange,
            selectedRange,
            preserveEditor,
          }),
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
        { MessageProtocol },
        { ConnectedPreviewMessage },
        { DidOpenTextDocumentMessage },
        { DidWriteFilesMessage },
        { DidDeleteFilesMessage },
      ]) => {
        if (cancelled) return;
        const { Workspace } = await import("../../workspace/Workspace");
        const onProtocol = (e: Event) => {
          if (!(e instanceof CustomEvent)) return;
          const m = e.detail;
          if (DidOpenTextDocumentMessage.type.is(m)) {
            loadFile();
          } else if (DidWriteFilesMessage.type.is(m)) {
            const editor = Workspace.window.getActiveEditorForPane("logic");
            if (
              m.params.remote &&
              m.params.files.find((f) => f.uri === editor?.uri)
            ) {
              loadFile();
            }
          } else if (DidDeleteFilesMessage.type.is(m)) {
            const editor = Workspace.window.getActiveEditorForPane("logic");
            if (m.params.files.find((f) => f.uri === editor?.uri)) {
              loadFile();
            }
          } else if (ConnectedPreviewMessage.type.is(m)) {
            // The inner screenplay-preview attaches its window listener
            // asynchronously (Preact mount + dynamic import), so it may
            // miss our startup LoadPreviewMessage. Replay on ready —
            // reset the dedupe guard first so the resend goes through.
            lastUri.current = undefined;
            lastVersion.current = undefined;
            lastText.current = undefined;
            loadFile();
          }
        };
        window.addEventListener(MessageProtocol.event, onProtocol);
        disposeProtocol = () =>
          window.removeEventListener(MessageProtocol.event, onProtocol);
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
      const { MessageProtocol } = await import(
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
      window.dispatchEvent(
        new CustomEvent(MessageProtocol.event, {
          detail: LoadPreviewMessage.type.request({
            type: "screenplay",
            textDocument: { uri: editor.uri, languageId, version, text },
            visibleRange: editor.visibleRange,
            selectedRange: editor.selectedRange,
            preserveEditor: Boolean(editor.originalFilename),
          }),
        }),
      );
    });
  }, [textPulledAt]);

  return (
    <>
      <style>{HOST_STYLE}</style>
      <PreviewScreenplayToolbar />
      <div class="relative flex flex-1 min-h-0">
        <div class="absolute inset-0 flex flex-col overflow-y-auto">
          {/* @ts-expect-error sparkdown's custom element from sparkdown-document-views */}
          <sparkdown-screenplay-preview
            scroll-margin="auto auto 60px auto"
            top="48px"
          />
        </div>
      </div>
    </>
  );
}
