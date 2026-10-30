import workspace from "../../workspace/WorkspaceStore";
import LogicList from "../logic-list/LogicList";
import LogicScriptsEditor from "../logic-scripts-editor/LogicScriptsEditor";

export const propDefaults = {};
export type LogicProps = Partial<typeof propDefaults>;

type View = "list" | "logic-editor";

export default function Logic(_props: LogicProps) {
  const view = (workspace.state.value.panes?.logic?.view || "list") as View;
  if (view === "logic-editor") return <LogicScriptsEditor />;
  return <LogicList />;
}
