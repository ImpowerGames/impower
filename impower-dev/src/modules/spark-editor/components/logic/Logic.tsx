import workspace from "../../workspace/WorkspaceStore";
import LogicList from "../logic-list/LogicList";
import LogicScriptsEditor from "../logic-scripts-editor/LogicScriptsEditor";

export const propDefaults = {};
export type LogicProps = Partial<typeof propDefaults>;

type View = "list" | "logic-editor";

/**
 * Logic pane wrapper. Routes between two views based on
 * `workspace.state.panes.logic.view`:
 *   - "list" (default): renders the LogicList with its Main/Scripts sub-tabs
 *   - "logic-editor": renders the fullscreen LogicScriptsEditor (the
 *     code editor for a specific script chosen from the scripts list)
 */
export default function Logic(_props: LogicProps) {
  const view = (workspace.state.value.panes?.logic?.view || "list") as View;
  if (view === "logic-editor") return <LogicScriptsEditor />;
  return <LogicList />;
}
