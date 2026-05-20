import { Book, BookClosed, Tab, Tabs } from "@impower/impower-ui/components";
import { startTransition } from "preact/compat";
import workspace from "../../workspace/WorkspaceStore";

export const propDefaults = {};
export type LogicListProps = Partial<typeof propDefaults>;

type Panel = "main" | "scripts";

/**
 * Logic > List view. Top sub-tabs switch between Main (the main.sd script
 * editor) and Scripts (the list of additional .sd files). Mirrors the
 * legacy <se-logic-list>'s <s-router> behavior.
 *
 * TODO: the legacy s-tab wrapped its label in <se-logic-diagnostics-label>
 * to color the tab red/yellow when the corresponding script has errors or
 * warnings. We're skipping that signal for now — the tabs render without
 * diagnostic coloring. Re-add once we have a per-Tab color/severity prop
 * (or subscribe to workspace.signals.diagnostics here and pass a color).
 */
export default function LogicList(_props: LogicListProps) {
  const panel = (workspace.state.value.panes?.logic?.panel ||
    "main") as Panel;

  const onPanelChange = (next: string) => {
    startTransition(() => {
      void import("../../workspace/Workspace").then(({ Workspace }) => {
        Workspace.window.openedPanel("logic", next);
      });
    });
  };

  return (
    <>
      <div class="sticky top-0 z-10 flex-none bg-engine-900">
        <Tabs
          value={panel}
          onChange={onPanelChange}
          indicator="underline"
          iconLayout="beside"
        >
          <Tab value="main" icon={BookClosed}>
            Main
          </Tab>
          <Tab value="scripts" icon={Book}>
            Scripts
          </Tab>
        </Tabs>
      </div>
      {/* `flex flex-col` (not just `block`) — the legacy spec-component
          children inside use sparkle's `grow` attribute (= flex:1), which
          needs a flex parent to fill the available height. Without it,
          se-logic-script-editor's inner s-box collapses to 0 height and
          CodeMirror renders invisible. */}
      <div class="relative flex flex-col flex-1 min-h-0">
        {/* @ts-expect-error legacy custom element */}
        {panel === "main" && <se-logic-script-editor filename="main.sd" style="--loading-indicator-width:50%" />}
        {/* @ts-expect-error legacy custom element */}
        {panel === "scripts" && <se-logic-scripts-list />}
      </div>
    </>
  );
}
