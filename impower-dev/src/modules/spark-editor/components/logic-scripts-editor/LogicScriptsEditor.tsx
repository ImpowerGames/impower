import { useComputed } from "@preact/signals";
import workspace from "../../workspace/WorkspaceStore";
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

  return (
    <div class="relative flex flex-1 flex-col min-h-0">
      <LogicScriptEditor filename={filename} />
    </div>
  );
}
