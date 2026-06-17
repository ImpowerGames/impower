import { LoadingBar } from "@impower/impower-ui/components";
import { useEffect, useRef } from "preact/hooks";
import type {
  ScriptEditorController as ScriptEditorControllerType,
  ScriptEditorOptions,
} from "./ScriptEditorController";
import cssText from "./sparkdown-script-editor.css?raw";

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

      // Host = the <sparkdown-script-editor> custom-element ancestor when
      // used via the element wrapper (vscode-sparkdown), else the
      // component's own root element when rendered directly as a Preact
      // component (impower-dev). Both are ancestors of the CodeMirror tree,
      // so the controller's querySelector + event wiring works either way.
      const realHost =
        (root.closest("sparkdown-script-editor") as HTMLElement | null) ??
        root;

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
    <div class="sparkdown-script-editor-root" ref={rootRef}>
      <style>{cssText}</style>
      {/* `top: -2px` (inline — Tailwind doesn't scan this package) so
          the bar sits ON the tab underline above the editor (both 2px
          tall) rather than 2px below it — looks like the underline
          indicator is filling as the script loads. When there's no
          underline above (LogicScriptsEditor view) the bar still
          reads as a banner at the top of the panel. Width comes from
          `--loading-indicator-width` set on an ancestor — 50% for
          main (matches the Main tab's half of the row), 100% when no
          sub-tabs are above. */}
      {/* Inline styles because Tailwind doesn't scan this package:
          - `top: -2px` so the bar overlaps the tab underline above.
          - `z-index: 20` to paint ON TOP of the parent tabs row's
            `z-10` indicator rather than behind it. */}
      <LoadingBar
        containerRef={loadingRef}
        class="absolute left-0 transition-opacity duration-250"
        style={{ top: "-2px", zIndex: 20 }}
      />
      <div class="main" ref={mainRef}>
        <div class="editor" ref={editorRef} />
        <div class="placeholder" ref={placeholderRef} hidden />
      </div>
    </div>
  );
}
