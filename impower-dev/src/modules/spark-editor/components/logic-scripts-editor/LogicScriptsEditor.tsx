import { useComputed } from "@preact/signals";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { useDiagnosticColor } from "../../workspace/useDiagnosticColor";
import workspace from "../../workspace/WorkspaceStore";

export const propDefaults = {};
export type LogicScriptsEditorProps = Partial<typeof propDefaults>;

const HOST_STYLE = `
  se-logic-scripts-editor {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    flex: 1 1 0%;
    min-height: 0;
  }
`;

/**
 * Multi-script editor frame. Used when the user opens a script from
 * the Scripts list — replaces the list view with a header (back button
 * + rename input) and the actual script editor underneath.
 *
 *   <se-file-editor-navigation>     ← still legacy spec-component; emits
 *     <input>                         a `changing` event on back-button
 *   </se-file-editor-navigation>     click that bubbles up.
 *   <se-logic-script-editor />      ← now Preact; receives `filename`.
 *
 * The rename input is a controlled `<input>` rather than the legacy
 * `<s-input>` — keeps the focus/select/blur/Enter behavior the legacy
 * had without a sparkle dependency. The file-options "delete" handler
 * the legacy class carried referenced an event that no markup actually
 * emits here, so it's been left out.
 */
export default function LogicScriptsEditor(_props: LogicScriptsEditorProps) {
  const filename = useComputed(() => {
    return (
      workspace.state.value.panes?.logic?.panels?.scripts?.activeEditor
        ?.filename || ""
    );
  }).value;

  const [oldName, oldExt] = filename.split(".");
  const displayName = oldName ?? "";

  // Color the rename header in red/yellow when the open script has
  // errors/warnings — same severity → color mapping the sub-tab uses.
  const diagnosticColor = useDiagnosticColor(filename);

  // Controlled input value. Reset whenever the active filename changes
  // so navigating between scripts shows the right name.
  const [draftName, setDraftName] = useState(displayName);
  useLayoutEffect(() => {
    setDraftName(displayName);
  }, [displayName]);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Listen for the back-button "changing" event that
  // `<se-file-editor-navigation>` bubbles up.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onChanging = (e: Event) => {
      if (!(e instanceof CustomEvent)) return;
      if (e.detail?.key === "close-file-editor") {
        import("../../workspace/Workspace").then(({ Workspace }) => {
          Workspace.window.closedFileEditor(filename);
        });
      }
    };
    root.addEventListener("changing", onChanging);
    return () => root.removeEventListener("changing", onChanging);
  }, [filename]);

  const commitRename = async () => {
    if (!draftName || draftName === oldName) return;
    const newFilename = `${draftName}.${oldExt ?? ""}`;
    const { Workspace } = await import("../../workspace/Workspace");
    const projectId = workspace.state.peek().project?.id;
    if (!projectId) return;
    const oldUri = Workspace.fs.getFileUri(projectId, filename);
    const newUri = Workspace.fs.getFileUri(projectId, newFilename);
    const renamedFiles = await Workspace.fs.renameFiles({
      files: [{ oldUri, newUri }],
    });
    if (renamedFiles.some((d) => d.type === "script")) {
      await Workspace.window.recordScriptChange();
    } else {
      await Workspace.window.recordAssetChange();
    }
    Workspace.window.openedFileEditor(newFilename, filename);
  };

  return (
    <div ref={rootRef} class="flex flex-1 flex-col min-h-0">
      <style>{HOST_STYLE}</style>
      {/* @ts-expect-error legacy custom element */}
      <se-file-editor-navigation>
        <input
          ref={inputRef}
          type="text"
          value={draftName}
          aria-label={displayName}
          placeholder={displayName}
          class={`w-full bg-transparent text-center text-base font-medium outline-none placeholder:text-[var(--theme-color-fab-bg)] ${
            diagnosticColor || "text-foreground"
          }`}
          onInput={(e) =>
            setDraftName((e.target as HTMLInputElement).value)
          }
          onFocus={(e) => (e.target as HTMLInputElement).select()}
          onBlur={() => {
            void commitRename();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        {/* @ts-expect-error legacy custom element */}
      </se-file-editor-navigation>
      <div class="relative flex flex-1 flex-col min-h-0">
        {/* @ts-expect-error legacy custom element */}
        <se-logic-script-editor filename={filename} />
      </div>
    </div>
  );
}
