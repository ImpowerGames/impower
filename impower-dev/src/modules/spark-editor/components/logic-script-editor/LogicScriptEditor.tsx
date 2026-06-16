// Protocol message types are dynamic-imported inside the listener effect:
// they re-export from `vscode-languageserver-protocol` which is CJS-only
// and crashes Vite SSR module load if statically imported here
// (see memory: feedback_defer_cjs_imports_in_ssr_loaded_modules).
import SparkdownScriptEditor from "@impower/sparkdown-document-views/src/modules/script-editor/SparkdownScriptEditor";
import { useComputed } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { debounce } from "../../utils/debounce";
import workspace from "../../workspace/WorkspaceStore";

export const propDefaults = {
  filename: "",
};
export type LogicScriptEditorProps = Partial<typeof propDefaults>;

const AUTOSAVE_DELAY = 200;

/**
 * Wraps the SparkdownScriptEditor (Preact) component with the
 * workspace-aware lifecycle the legacy `<se-logic-script-editor>`
 * provided. The inner editor is imported directly from
 * sparkdown-document-views rather than registered as a custom element.
 *
 * Lifecycle ownership is split between two effects:
 *   1. Listener effect (deps: []). Attaches the `jsonrpc` window
 *      listener exactly once per mount and never re-runs — so when
 *      the inner editor's `ConnectedEditorMessage` fires after its
 *      async controller startup, we're guaranteed to catch it.
 *   2. Reload effect (deps: [filename, textPulledAt]). Re-triggers
 *      a `loadFile` when the file we're showing changes or when the
 *      workspace pulled fresh text from the remote — but only after
 *      the initial load has already happened (`uriRef.current` is
 *      set by the first ConnectedEditor-driven load).
 *
 * If we put the listener in an effect that depends on textPulledAt,
 * each early signal initialization would tear down + re-attach the
 * listener, missing the inner editor's one-shot ConnectedEditor
 * notification.
 */
export default function LogicScriptEditor({
  filename = "",
}: LogicScriptEditorProps) {
  // Stable per-document state — read by the protocol handler and save flow.
  const uriRef = useRef<string | undefined>(undefined);
  const versionRef = useRef<number | undefined>(undefined);
  const textRef = useRef<string | undefined>(undefined);

  // Latest props/store values stashed in refs so the listener (mounted
  // once) always reads current values without needing to reattach.
  const filenameRef = useRef(filename);
  filenameRef.current = filename;
  const loadFileRef = useRef<() => Promise<void>>(async () => {});

  const textPulledAt = useComputed(
    () => workspace.state.value.sync?.textPulledAt || "",
  ).value;

  const readonly = useComputed(() => {
    const status = workspace.state.value.sync?.status;
    return (
      status === "syncing" ||
      status === "loading" ||
      status === "importing" ||
      status === "exporting"
    );
  }).value;

  // Listener effect — mount-only, no dynamic deps, so it survives every
  // workspace signal update and is guaranteed to be attached when the
  // inner editor's ConnectedEditorMessage fires.
  useEffect(() => {
    let disposed = false;
    let detach: (() => void) | undefined;

    (async () => {
      const [
        { ConnectedEditorMessage },
        { LoadEditorMessage },
        { MessageProtocol },
        { DidChangeTextDocumentMessage },
        { DidSaveTextDocumentMessage },
        { DidDeleteFilesMessage },
        { DidWriteFilesMessage },
      ] = await Promise.all([
        import(
          "@impower/spark-editor-protocol/src/protocols/editor/ConnectedEditorMessage"
        ),
        import(
          "@impower/spark-editor-protocol/src/protocols/editor/LoadEditorMessage"
        ),
        import("@impower/spark-editor-protocol/src/protocols/MessageProtocol"),
        import(
          "@impower/spark-editor-protocol/src/protocols/textDocument/DidChangeTextDocumentMessage"
        ),
        import(
          "@impower/spark-editor-protocol/src/protocols/textDocument/DidSaveTextDocumentMessage"
        ),
        import(
          "@impower/spark-editor-protocol/src/protocols/workspace/DidDeleteFilesMessage"
        ),
        import(
          "@impower/spark-editor-protocol/src/protocols/workspace/DidWriteFilesMessage"
        ),
      ]);
      if (disposed) return;

      const loadFile = async () => {
        const { Workspace } = await import("../../workspace/Workspace");
        if (disposed) return;
        const pid = workspace.state.peek().project?.id;
        if (!pid) return;
        const fn = filenameRef.current || "main.sd";
        const editor = Workspace.window.getActiveEditorForFile(fn);
        if (!editor) return;

        const uri = editor.uri;
        const files = await Workspace.fs.getFiles(pid);
        if (disposed) return;
        const file = files[uri];
        const text = file?.text || "";
        const version = file?.version || 0;
        const languageId = file?.languageId || "sparkdown";

        const languageServerInitializeParams =
          await Workspace.ls.getInitializeParams();
        const languageServerInitializeResult =
          await Workspace.ls.getInitializeResult();
        if (disposed) return;

        uriRef.current = uri;
        versionRef.current = version;
        textRef.current = text;

        const detail = LoadEditorMessage.type.request({
          textDocument: { uri, languageId, version, text },
          focused: editor.focused,
          visibleRange: editor.visibleRange,
          selectedRange: editor.selectedRange,
          breakpointLines: editor.breakpointLines,
          pinpointLines: editor.pinpointLines,
          highlightLines: editor.highlightLines,
          languageServerInitializeParams,
          languageServerInitializeResult,
          preserveEditor: Boolean(editor.originalFilename),
        });
        window.dispatchEvent(
          new CustomEvent(MessageProtocol.event, {
            detail,
            bubbles: true,
            composed: true,
          }),
        );
      };
      loadFileRef.current = loadFile;

      const debouncedSave = debounce(async () => {
        if (uriRef.current && versionRef.current && textRef.current != null) {
          const { Workspace } = await import("../../workspace/Workspace");
          if (disposed) return;
          await Workspace.fs.writeTextDocument({
            textDocument: {
              uri: uriRef.current,
              version: versionRef.current,
              text: textRef.current,
            },
          });
          await Workspace.window.recordScriptChange();
        }
      }, AUTOSAVE_DELAY);

      const handleProtocol = (e: Event) => {
        if (!(e instanceof CustomEvent)) return;
        const detail = e.detail;
        if (DidChangeTextDocumentMessage.type.is(detail)) {
          const params = detail.params;
          if (
            uriRef.current != null &&
            uriRef.current === params.textDocument.uri
          ) {
            versionRef.current = params.textDocument.version;
          }
        } else if (DidWriteFilesMessage.type.is(detail)) {
          const params = detail.params;
          if (
            params.remote &&
            params.files.find((f) => f.uri === uriRef.current)
          ) {
            loadFile();
          }
        } else if (DidDeleteFilesMessage.type.is(detail)) {
          const params = detail.params;
          if (params.files.find((f) => f.uri === uriRef.current)) {
            loadFile();
          }
        } else if (DidSaveTextDocumentMessage.type.is(detail)) {
          const params = detail.params;
          if (
            uriRef.current != null &&
            uriRef.current === params.textDocument.uri &&
            versionRef.current != null
          ) {
            if (params.text != null) {
              textRef.current = params.text;
              debouncedSave();
            }
          }
        } else if (ConnectedEditorMessage.type.is(detail)) {
          // Inner editor signals it's mounted and ready — initial load.
          loadFile();
        }
      };

      window.addEventListener(MessageProtocol.event, handleProtocol);
      detach = () =>
        window.removeEventListener(MessageProtocol.event, handleProtocol);

      // Initial load — don't rely solely on ConnectedEditorMessage. The inner
      // SparkdownScriptEditor mounts as a direct child, and its controller can
      // emit ConnectedEditor before this listener attaches (its single dynamic
      // import resolves faster than this effect's Promise.all of 7), so the
      // one-shot would be missed and the editor would never receive a document.
      // The proactive load covers the controller-ahead ordering; the
      // ConnectedEditor handler above covers the controller-behind ordering.
      // Mirrors PreviewScreenplay.
      loadFile();
    })();

    return () => {
      disposed = true;
      detach?.();
    };
  }, []);

  // Reload effect — re-fires loadFile when the file we're showing
  // changes or when the workspace pulled fresh text. Only kicks in
  // after the initial load (uriRef populated by ConnectedEditor
  // handler); the mount-time render path is the listener effect.
  useEffect(() => {
    if (!uriRef.current) return;
    loadFileRef.current?.();
  }, [filename, textPulledAt]);

  return (
    <div class="relative flex flex-1 flex-col min-h-0 bg-engine-950">
      <SparkdownScriptEditor readonly={readonly} top="0px" bottom="60px" />
    </div>
  );
}
