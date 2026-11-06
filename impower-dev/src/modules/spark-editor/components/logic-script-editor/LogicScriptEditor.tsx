import { useCoarsePointer } from "@impower/impower-ui/layout";
import SparkdownScriptEditor from "@impower/sparkdown-document-views/src/modules/script-editor/SparkdownScriptEditor";
import { useComputed } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { debounce } from "../../utils/debounce";
import { showSnackbar } from "../../utils/snackbar";
import workspaceSettings from "../../workspace/settings/WorkspaceSettings";
import { useScriptReadonly } from "../../workspace/useActiveEditor";
import workspace from "../../workspace/WorkspaceStore";
import ScriptHeader from "../script-header/ScriptHeader";
import WriterBar from "../writer-bar/WriterBar";

export const propDefaults = {
  filename: "",
};
export type LogicScriptEditorProps = Partial<typeof propDefaults>;

const AUTOSAVE_DELAY = 200;

let editorCount = 0;

const showPasteRefused = () =>
  showSnackbar({
    message: "Allow clipboard access to paste text copied outside the editor.",
  });

export default function LogicScriptEditor({
  filename = "",
}: LogicScriptEditorProps) {
  const uriRef = useRef<string | undefined>(undefined);
  const versionRef = useRef<number | undefined>(undefined);
  const textRef = useRef<string | undefined>(undefined);

  const filenameRef = useRef(filename);
  filenameRef.current = filename;
  const loadFileRef = useRef<() => Promise<void>>(async () => {});

  const textPulledAt = useComputed(
    () => workspace.state.value.sync?.textPulledAt || "",
  ).value;

  const coarsePointer = useCoarsePointer();

  const appearance = workspaceSettings.scriptAppearance.value;

  const readonly = useScriptReadonly();

  useEffect(() => {
    let disposed = false;
    let detach: (() => void) | undefined;

    (async () => {
      const [
        { ConnectedEditorMessage },
        { LoadEditorMessage },
        { onProtocolMessage, sendProtocolMessage },
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

      const origin = `LogicScriptEditor:${++editorCount}`;
      let connection = 0;
      let sentOnConnection = -1;
      let pendingLoad: Promise<void> = Promise.resolve();

      const sendLoadEditor = async () => {
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

        const latest = Workspace.window.getActiveEditorForFile(fn);
        const current = latest?.uri === uri ? latest : editor;
        const detail = LoadEditorMessage.type.request({
          textDocument: { uri, languageId, version, text },
          focused: current.focused,
          visibleRange: current.visibleRange,
          selectedRange: current.selectedRange,
          breakpointLines: editor.breakpointLines,
          pinpointLines: editor.pinpointLines,
          highlightLines: editor.highlightLines,
          startingValueLines: editor.startingValueLines,
          routePins: editor.routePins,
          languageServerInitializeParams,
          languageServerInitializeResult,
          preserveEditor: Boolean(editor.originalFilename),
        });
        sentOnConnection = connection;
        sendProtocolMessage(detail);
      };
      const loadFile = () => (pendingLoad = sendLoadEditor());
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
            origin,
          });
          await Workspace.window.recordScriptChange();
        }
      }, AUTOSAVE_DELAY);

      const disposers = [
        onProtocolMessage(DidChangeTextDocumentMessage.type, (message) => {
          const params = message.params;
          if (
            uriRef.current != null &&
            uriRef.current === params.textDocument.uri
          ) {
            versionRef.current = params.textDocument.version;
          }
        }),
        onProtocolMessage(DidWriteFilesMessage.type, (message) => {
          const params = message.params;
          const changed = params.files.find((f) => f.uri === uriRef.current);
          if (!changed) {
            return;
          }
          const diverged =
            changed.text != null &&
            textRef.current != null &&
            changed.text !== textRef.current;
          if (params.remote || (diverged && params.origin !== origin)) {
            loadFile();
          }
        }),
        onProtocolMessage(DidDeleteFilesMessage.type, (message) => {
          const params = message.params;
          if (params.files.find((f) => f.uri === uriRef.current)) {
            loadFile();
          }
        }),
        onProtocolMessage(DidSaveTextDocumentMessage.type, (message) => {
          const params = message.params;
          if (
            uriRef.current != null &&
            uriRef.current === params.textDocument.uri &&
            versionRef.current != null &&
            params.text != null
          ) {
            textRef.current = params.text;
            debouncedSave();
          }
        }),
        onProtocolMessage(ConnectedEditorMessage.type, async () => {
          const current = ++connection;
          await pendingLoad.catch(() => undefined);
          if (disposed || current !== connection || sentOnConnection === current) {
            return;
          }
          loadFile();
        }),
      ];

      detach = () => disposers.forEach((d) => d());

      loadFile();
    })();

    return () => {
      disposed = true;
      detach?.();
    };
  }, []);

  useEffect(() => {
    if (!uriRef.current) return;
    loadFileRef.current?.();
  }, [filename, textPulledAt]);

  return (
    <div class="relative flex flex-1 flex-col min-h-0 bg-workspace">
      <ScriptHeader filename={filename || "main.sd"} />
      <div class="relative flex flex-1 flex-col min-h-0">
        <SparkdownScriptEditor
          readonly={readonly}
          coarsePointer={coarsePointer}
          appearance={appearance}
          top="0px"
          bottom="60px"
          onPasteRefused={showPasteRefused}
        />
      </div>
      <WriterBar filename={filename || "main.sd"} canEdit={!readonly} />
    </div>
  );
}
