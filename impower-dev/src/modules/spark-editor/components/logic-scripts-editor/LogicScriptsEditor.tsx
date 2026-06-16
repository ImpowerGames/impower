import { Ripple } from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { useDiagnosticColor } from "../../workspace/useDiagnosticColor";
import workspace from "../../workspace/WorkspaceStore";
import FileEditorNavigation from "../file-editor-navigation/FileEditorNavigation";
import LogicScriptEditor from "../logic-script-editor/LogicScriptEditor";

export const propDefaults = {};
export type LogicScriptsEditorProps = Partial<typeof propDefaults>;

/**
 * Multi-script editor frame. Used when the user opens a script from
 * the Scripts list — replaces the list view with a header (back button
 * + rename input) and the actual script editor underneath.
 *
 *   <FileEditorNavigation onBack={...}>   ← Preact, callback API
 *     <input>                                (rename, controlled)
 *   </FileEditorNavigation>
 *   <se-logic-script-editor />            ← Preact; receives `filename`.
 *
 * The rename input is a controlled `<input>` rather than the legacy
 * `<s-input>`. The file-options "delete" handler the legacy class
 * carried referenced an event that no markup actually emits here, so
 * it's been left out.
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

  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleBack = async () => {
    const { Workspace } = await import("../../workspace/Workspace");
    Workspace.window.closedFileEditor(filename);
  };

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
    <div class="flex flex-1 flex-col min-h-0">
      <FileEditorNavigation onBack={handleBack}>
        {/* Wrapper carries the tap ripple + hover tint, mirroring main's
            `<s-input ripple-color="white">`. `text-foreground` (white) pins
            the <Ripple/> wave to white regardless of the input's diagnostic
            color (main's ripple-color="white" is likewise fixed); the input
            keeps its own (possibly red/yellow) text color. overflow-hidden +
            rounded clips the wave to the field box. */}
        <div class="relative w-full overflow-hidden rounded text-foreground hover:bg-foreground/5">
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
          <Ripple />
        </div>
      </FileEditorNavigation>
      <div class="relative flex flex-1 flex-col min-h-0">
        <LogicScriptEditor filename={filename} />
      </div>
    </div>
  );
}
