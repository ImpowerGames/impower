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

export default function LogicScriptEditor({
  filename = "",
}: LogicScriptEditorProps) {
  const uriRef = useRef<string | undefined>(undefined);
  const versionRef = useRef<number | undefined>(undefined);
  const textRef = useRef<string | undefined>(undefined);

  const ownWritesRef = useRef<Set<string>>(new Set<string>());
  const OWN_WRITES_LIMIT = 16;
  const normalizeText = (s: string) => s.replace(/\r\n|\r/g, "\n");

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
          startingValueLines: editor.startingValueLines,
          routePins: editor.routePins,
          languageServerInitializeParams,
          languageServerInitializeResult,
          preserveEditor: Boolean(editor.originalFilename),
        });
        sendProtocolMessage(detail);
      };
      loadFileRef.current = loadFile;

      const debouncedSave = debounce(async () => {
        if (uriRef.current && versionRef.current && textRef.current != null) {
          const written = textRef.current;
          ownWritesRef.current.add(normalizeText(written));
          if (ownWritesRef.current.size > OWN_WRITES_LIMIT) {
            ownWritesRef.current = new Set(
              [...ownWritesRef.current].slice(-OWN_WRITES_LIMIT),
            );
          }
          const { Workspace } = await import("../../workspace/Workspace");
          if (disposed) return;
          await Workspace.fs.writeTextDocument({
            textDocument: {
              uri: uriRef.current,
              version: versionRef.current,
              text: written,
            },
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
          const changedText =
            changed.text != null ? normalizeText(changed.text) : null;
          const isOwnWrite =
            changedText != null && ownWritesRef.current.has(changedText);
          const diverged =
            changedText != null &&
            textRef.current != null &&
            changedText !== normalizeText(textRef.current);
          if (params.remote || (diverged && !isOwnWrite)) {
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
        onProtocolMessage(ConnectedEditorMessage.type, () => {
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
    <div class="relative flex flex-1 flex-col min-h-0 bg-engine-950">
      <SparkdownScriptEditor readonly={readonly} top="0px" bottom="60px" />
    </div>
  );
}
