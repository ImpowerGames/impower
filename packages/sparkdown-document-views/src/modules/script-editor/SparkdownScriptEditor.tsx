import { LoadingBar } from "@impower/impower-ui/components";
import { useEffect, useRef } from "preact/hooks";
import type {
  ScriptEditorController as ScriptEditorControllerType,
  ScriptEditorOptions,
} from "./ScriptEditorController";
import cssText from "./sparkdown-script-editor.css";

export const propDefaults = {
  readonly: false,
  scrollMargin: "",
  top: "",
  bottom: "",
};

export type SparkdownScriptEditorProps = Partial<typeof propDefaults>;

// Holds the language-server worker + connection set by impower-dev's bootstrap
// before any instance mounts. Module-level singleton; both refs are required
// for the controller to construct successfully.
let languageServerWorker: Worker | undefined;
let languageServerConnection:
  | ScriptEditorOptions["languageServerConnection"]
  | undefined;

export function setLanguageServer(opts: {
  worker: Worker;
  connection: ScriptEditorOptions["languageServerConnection"];
}): void {
  languageServerWorker = opts.worker;
  languageServerConnection = opts.connection;
}

// Renders the DOM shell (root + loading bar + main { editor, placeholder })
// and bootstraps ScriptEditorController in useEffect. The Controller is
// dynamically imported so impower-dev's SSR module walk doesn't pull in
// vscode-languageserver-protocol (CJS, fails Vite's ESM SSR with "exports
// is not defined").
export default function SparkdownScriptEditor({
  readonly,
  scrollMargin,
  top,
  bottom,
}: SparkdownScriptEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const placeholderRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<ScriptEditorControllerType | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const loading = loadingRef.current;
    const editor = editorRef.current;
    const placeholder = placeholderRef.current;
    const main = mainRef.current;
    if (!root || !loading || !editor || !placeholder || !main) return;

    let cancelled = false;

    import("./ScriptEditorController").then(({ ScriptEditorController }) => {
      if (cancelled) return;
      if (!languageServerWorker || !languageServerConnection) {
        console.error(
          "SparkdownScriptEditor: setLanguageServer() must be called before mounting.",
        );
        return;
      }

      // Light-DOM: the custom element is a normal ancestor in the same tree,
      // so closest() finds it directly without piercing a shadow boundary.
      const realHost = root.closest(
        "sparkdown-script-editor",
      ) as HTMLElement | null;
      if (!realHost) return;

      const controller = new ScriptEditorController(
        realHost,
        { editor, loading, placeholder, main },
        {
          readonly: !!readonly,
          scrollMargin: scrollMargin ?? "",
          top: top ?? "",
          bottom: bottom ?? "",
          languageServerWorker,
          languageServerConnection,
        },
      );
      controller.setup();
      controllerRef.current = controller;
    });

    return () => {
      cancelled = true;
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
    // Only re-create the controller on shape-changing props. Readonly is
    // applied reactively via the next useEffect — recreating the editor
    // would lose state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollMargin, top, bottom]);

  // Apply readonly changes without rebuilding the editor.
  useEffect(() => {
    controllerRef.current?.setReadonly(!!readonly);
  }, [readonly]);

  return (
    <div class="root" ref={rootRef}>
      <style>{cssText}</style>
      <LoadingBar containerRef={loadingRef} class="absolute top-0 left-0 right-0 z-10 transition-opacity duration-250" />
      <div class="main" ref={mainRef}>
        <div class="editor" ref={editorRef} />
        <div class="placeholder" ref={placeholderRef} hidden />
      </div>
    </div>
  );
}
