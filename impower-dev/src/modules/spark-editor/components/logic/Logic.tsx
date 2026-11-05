import workspace from "../../workspace/WorkspaceStore";
import { SCRIPT_EDITOR_VIEW, SCRIPTS_VIEW } from "../../workspace/routes";
import LogicScriptEditor from "../logic-script-editor/LogicScriptEditor";
import LogicScriptsEditor from "../logic-scripts-editor/LogicScriptsEditor";
import ScriptsPage from "../scripts-page";

export const propDefaults = {};
export type LogicProps = Partial<typeof propDefaults>;

export default function Logic(_props: LogicProps) {
  const logic = workspace.state.value.panes?.logic;
  if (logic?.view === SCRIPTS_VIEW) return <ScriptsPage />;
  if (
    logic?.view === SCRIPT_EDITOR_VIEW &&
    logic.panels.scripts?.activeEditor?.open
  ) {
    return <LogicScriptsEditor />;
  }
  return (
    <div
      class="flex flex-1 flex-col min-h-0"
      style="--loading-indicator-width:50%"
    >
      <LogicScriptEditor filename="main.sd" />
    </div>
  );
}
