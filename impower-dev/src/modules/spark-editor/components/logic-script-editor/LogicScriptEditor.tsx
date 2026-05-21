import { ConnectedEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ConnectedEditorMessage";
import { LoadEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/LoadEditorMessage";
import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { DidChangeTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidChangeTextDocumentMessage";
import { DidSaveTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidSaveTextDocumentMessage";
import { DidDeleteFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidDeleteFilesMessage";
import { DidWriteFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidWriteFilesMessage";
import { useComputed } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { debounce } from "../../utils/debounce";
import workspace from "../../workspace/WorkspaceStore";

export const propDefaults = {
  filename: "",
};
export type LogicScriptEditorProps = Partial<typeof propDefaults>;

const HOST_STYLE = `
  se-logic-script-editor {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    flex: 1 1 0%;
    min-height: 0;
  }

  /* Sparkle's normalize sets \`* { max-width: 100% }\` on everything,
     which collapses CodeMirror's selection/cursor SVG layers: the
     layer is \`position: absolute\` with no explicit size and computes
     to 0×0, so \`max-width: 100%\` then caps each descendant's inline-
     style width (e.g. .cm-selectionBackground's 172.688px) to 0 —
     hiding the painted selection rectangle. Restore \`max-width: none\`
     for the CM tree so CM's own absolute layout wins. */
  se-logic-script-editor .cm-editor,
  se-logic-script-editor .cm-editor * {
    max-width: none;
  }

  /* Spec-component normalize sets \`* { user-select: none }\`; re-assert
     for the CodeMirror content + gutter so text can be selected. */
  se-logic-script-editor .cm-content,
  se-logic-script-editor .cm-content *,
  se-logic-script-editor .cm-gutters,
  se-logic-script-editor .cm-gutters * {
    user-select: text;
    -webkit-user-select: text;
  }
`;

const AUTOSAVE_DELAY = 200;

/**
 * Wraps `<sparkdown-script-editor>` with the workspace-aware lifecycle
 * the legacy `<se-logic-script-editor>` provided.
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
  const editorRef = useRef<HTMLElement | null>(null);
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

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (readonly) el.setAttribute("readonly", "");
    else el.removeAttribute("readonly");
  }, [readonly]);

  // Listener effect — mount-only, no dynamic deps, so it survives every
  // workspace signal update and is guaranteed to be attached when the
  // inner editor's ConnectedEditorMessage fires.
  useEffect(() => {
    let disposed = false;

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
    return () => {
      disposed = true;
      window.removeEventListener(MessageProtocol.event, handleProtocol);
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
    <>
      <style>{HOST_STYLE}</style>
      <div class="relative flex flex-1 flex-col min-h-0 bg-engine-950">
        {/* @ts-expect-error legacy custom element */}
        <sparkdown-script-editor
          ref={editorRef}
          top="0px"
          bottom="60px"
        />
      </div>
    </>
  );
}
