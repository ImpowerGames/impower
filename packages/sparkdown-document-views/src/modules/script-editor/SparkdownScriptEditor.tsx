import type {
  ContextMenuModel,
  ShortcutCombos,
} from "@impower/codemirror-vscode-lsp-client/src";
import {
  ActionSheet,
  type ActionSheetItem,
} from "@impower/impower-ui/action-sheet";
import { LoadingBar } from "@impower/impower-ui/loading-bar";
import { useEffect, useRef, useState } from "preact/hooks";
import type { ScriptAppearance } from "../../cm-script-appearance/scriptAppearanceOptions";
import type {
  ScriptEditorController as ScriptEditorControllerType,
  ScriptEditorOptions,
} from "./ScriptEditorController";
import cssText from "./sparkdown-script-editor.css?raw";

export const propDefaults = {
  readonly: false,
  coarsePointer: false,
  scrollMargin: "",
  top: "",
  bottom: "",
};

export type SparkdownScriptEditorProps = Partial<typeof propDefaults> & {
  appearance: ScriptAppearance;
  shortcuts?: ShortcutCombos;
  onPasteRefused?: () => void;
};

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

export default function SparkdownScriptEditor({
  readonly,
  coarsePointer,
  appearance,
  shortcuts,
  scrollMargin,
  top,
  bottom,
  onPasteRefused,
}: SparkdownScriptEditorProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuModel | null>(null);
  const onPasteRefusedRef = useRef(onPasteRefused);
  onPasteRefusedRef.current = onPasteRefused;
  const rootRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const placeholderRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<ScriptEditorControllerType | null>(null);
  const coarsePointerRef = useRef(!!coarsePointer);
  coarsePointerRef.current = !!coarsePointer;
  const appearanceRef = useRef(appearance);
  appearanceRef.current = appearance;
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

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

      const realHost =
        (root.closest("sparkdown-script-editor") as HTMLElement | null) ??
        root;

      const controller = new ScriptEditorController(
        realHost,
        { editor, loading, placeholder, main },
        {
          readonly: !!readonly,
          coarsePointer: coarsePointerRef.current,
          appearance: appearanceRef.current,
          shortcuts: shortcutsRef.current,
          onContextMenu: setContextMenu,
          onPasteRefused: () => onPasteRefusedRef.current?.(),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollMargin, top, bottom]);

  useEffect(() => {
    controllerRef.current?.setReadonly(!!readonly);
  }, [readonly]);

  useEffect(() => {
    controllerRef.current?.setCoarsePointer(!!coarsePointer);
  }, [coarsePointer]);

  useEffect(() => {
    controllerRef.current?.setAppearance(appearance);
  }, [appearance]);

  useEffect(() => {
    if (shortcuts) {
      controllerRef.current?.setShortcuts(shortcuts);
    }
  }, [shortcuts]);

  return (
    <div class="sparkdown-script-editor-root" ref={rootRef}>
      <style>{cssText}</style>
      <LoadingBar
        containerRef={loadingRef}
        class="absolute left-0 transition-opacity duration-250"
        style={{ top: "-2px", zIndex: 20 }}
      />
      <div class="main" ref={mainRef}>
        <div class="editor" ref={editorRef} />
        <div class="placeholder" ref={placeholderRef} hidden />
      </div>
      <ActionSheet
        open={!!contextMenu}
        onOpenChange={(open) => {
          if (!open) {
            contextMenu?.dismiss();
          }
        }}
        title="Edit"
        items={
          contextMenu?.items.map(
            (item): ActionSheetItem =>
              "type" in item
                ? item
                : {
                    label: item.label,
                    disabled: item.disabled,
                    onSelect: item.run,
                  },
          ) ?? []
        }
      />
    </div>
  );
}
