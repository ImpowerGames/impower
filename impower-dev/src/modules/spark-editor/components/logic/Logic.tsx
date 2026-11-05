import { Button } from "@impower/impower-ui/components";
import workspace from "../../workspace/WorkspaceStore";
import { SCRIPT_EDITOR_VIEW, SCRIPTS_VIEW } from "../../workspace/routes";
import LogicScriptEditor from "../logic-script-editor/LogicScriptEditor";
import LogicScriptsEditor from "../logic-scripts-editor/LogicScriptsEditor";
import ScriptsPage from "../scripts-page";

export const propDefaults = {};
export type LogicProps = Partial<typeof propDefaults>;

const browseScripts = async () => {
  const { Workspace } = await import("../../workspace/Workspace");
  Workspace.window.browseScripts();
};

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
    <div class="flex flex-1 flex-col min-h-0">
      <div class="flex h-12 flex-none items-center justify-end border-b border-edge px-2">
        <Button variant="quiet" class="text-accent" onClick={() => void browseScripts()}>
          Browse scripts
        </Button>
      </div>
      <div
        class="relative flex flex-1 flex-col min-h-0"
        style="--loading-indicator-width:50%"
      >
        <LogicScriptEditor filename="main.sd" />
      </div>
    </div>
  );
}
