import workspace from "../../workspace/WorkspaceStore";
import LogicList from "../logic-list/LogicList";

export const propDefaults = {};
export type LogicProps = Partial<typeof propDefaults>;

const HOST_STYLE = `
  se-logic {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
  }
`;

type View = "list" | "logic-editor";

/**
 * Logic pane wrapper. Routes between two views based on
 * `workspace.state.panes.logic.view`:
 *   - "list" (default): renders the LogicList with its Main/Scripts sub-tabs
 *   - "logic-editor": renders the fullscreen logic-scripts-editor (the
 *     code editor for a specific script chosen from the scripts list)
 *
 * The legacy heavy components (logic-script-editor, logic-scripts-list,
 * logic-scripts-editor, logic-diagnostics-label) stay as spec-components
 * for now — they wrap CodeMirror + the language-server protocol +
 * diagnostic overlays and warrant a dedicated port pass.
 */
export default function Logic(_props: LogicProps) {
  const view = (workspace.state.value.panes?.logic?.view || "list") as View;
  return (
    <>
      <style>{HOST_STYLE}</style>
      {view === "list" && <LogicList />}
      {/* @ts-expect-error legacy custom element */}
      {view === "logic-editor" && <se-logic-scripts-editor />}
    </>
  );
}
