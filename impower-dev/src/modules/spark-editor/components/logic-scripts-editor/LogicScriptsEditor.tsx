import { Ripple } from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { useDiagnosticColor } from "../../workspace/useDiagnosticColor";
import workspace from "../../workspace/WorkspaceStore";
import FileEditorNavigation from "../file-editor-navigation/FileEditorNavigation";
import LogicScriptEditor from "../logic-script-editor/LogicScriptEditor";

export const propDefaults = {};
export type LogicScriptsEditorProps = Partial<typeof propDefaults>;

export default function LogicScriptsEditor(_props: LogicScriptsEditorProps) {
  const filename = useComputed(() => {
    return (
      workspace.state.value.panes?.logic?.panels?.scripts?.activeEditor
        ?.filename || ""
    );
  }).value;

  const lastSlash = filename.lastIndexOf("/");
  const dir = lastSlash >= 0 ? filename.slice(0, lastSlash) : "";
  const base = lastSlash >= 0 ? filename.slice(lastSlash + 1) : filename;
  const lastDot = base.lastIndexOf(".");
  const oldName = lastDot > 0 ? base.slice(0, lastDot) : base;
  const oldExt = lastDot > 0 ? base.slice(lastDot + 1) : "";
  const displayName = oldName;

  const diagnosticColor = useDiagnosticColor(filename);

  const [draftName, setDraftName] = useState(displayName);
  useLayoutEffect(() => {
    setDraftName(displayName);
  }, [displayName]);

  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleBack = async () => {
    const { Workspace } = await import("../../workspace/Workspace");
    Workspace.window.closeFileEditor(filename);
  };

  const commitRename = async () => {
    if (!draftName || draftName === oldName) return;
    const newBase = oldExt ? `${draftName}.${oldExt}` : draftName;
    const newFilename = dir ? `${dir}/${newBase}` : newBase;
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
    Workspace.window.openFileEditor(newFilename, filename);
  };

  return (
    <div class="flex flex-1 flex-col min-h-0">
      <FileEditorNavigation onBack={handleBack}>

        <div class="relative inline-block h-10 overflow-hidden rounded px-2 text-foreground hover:bg-foreground/5">
          <input
            ref={inputRef}
            type="text"
            value={draftName}
            aria-label={displayName}
            placeholder={displayName}
            class={`h-full bg-transparent text-center text-lg font-normal outline-none placeholder:text-engine-700 ${
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
