import {
  Book,
  BookClosed,
  Router,
  Tab,
  Tabs,
} from "@impower/impower-ui/components";
import { startTransition } from "preact/compat";
import { useDiagnosticColor } from "../../workspace/useDiagnosticColor";
import workspace from "../../workspace/WorkspaceStore";
import FileAddButton from "../file-list/FileAddButton";
import FileList from "../file-list/FileList";
import FileListBorder from "../file-list/FileListBorder";
import LogicScriptEditor from "../logic-script-editor/LogicScriptEditor";
import LogicScriptsEditor from "../logic-scripts-editor/LogicScriptsEditor";

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
  const state = workspace.state.value;
  const panel = (state.panes?.logic?.panel || "main") as Panel;
  // Per-tab diagnostic color — Main reflects main.sd, Scripts aggregates
  // across all non-main scripts (matches the legacy behavior). Tab paints
  // both its icon and label in this color when set.
  const mainColor = useDiagnosticColor("main.sd");
  const scriptsColor = useDiagnosticColor();
  // The Scripts panel switches between two sub-views:
  //   - list view (shows the FileList of *.sd files)
  //   - editor view (shows the active script in <se-logic-scripts-editor>)
  // The legacy logic-scripts-list rendered just the list and relied on a
  // higher-level router driven by 'changing'/'changed' bubbling events to
  // swap to the editor. Here we read `activeEditor.open` directly — that
  // flag is set by `Workspace.window.openedFileEditor()` and cleared by
  // `closedFileEditor()`, so back-button + click flows just work.
  const scriptsActiveEditor = state.panes?.logic?.panels?.scripts?.activeEditor;
  const showScriptsEditor =
    !!scriptsActiveEditor?.open && !!scriptsActiveEditor?.filename;

  const onPanelChange = (next: string) => {
    startTransition(() => {
      void import("../../workspace/Workspace").then(({ Workspace }) => {
        Workspace.window.openedPanel("logic", next);
      });
    });
  };

  // Two-level router nesting, mirroring the baseline's <se-logic>:
  //   outer (this Router, mode="zoom")  = list-view  ↔  script editor
  //       — non-directional zoom+fade, matching main's `<s-router key=
  //         "logic-view">` (no `directional` → exit-zoom/enter-zoom +
  //         fade). This is the drill-in/back.
  //   inner (mode="slide-x")            = Main  ↔  Scripts
  //       — directional slide, matching main's `<s-router key="logic-panel"
  //         directional>`.
  // The whole list view (sub-tabs INCLUDED) lives in the outer "list" route,
  // so opening a script cross-fades the tabs+content out and the editor in —
  // exactly like main, instead of the tabs popping away instantly.
  return (
    <Router active={showScriptsEditor ? "editor" : "list"} mode="zoom">
      <div key="list" class="relative flex flex-col flex-1 min-h-0">
        <div class="sticky top-0 z-10 flex-none bg-engine-900">
          <Tabs
            value={panel}
            onChange={onPanelChange}
            indicator="underline"
            iconLayout="beside"
          >
            <Tab value="main" icon={BookClosed} color={mainColor}>
              Main
            </Tab>
            <Tab value="scripts" icon={Book} color={scriptsColor}>
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
          <Router active={panel} mode="slide-x">
            {/* `--loading-indicator-width: 50%` makes the LoadingBar sit
                above the (active) Main tab indicator on the parent Tabs,
                giving the "indicator fills with progress" illusion. The
                CSS var cascades to the LoadingBar inside via
                `var(--loading-indicator-width, 100%)`. */}
            <div
              key="main"
              class="flex flex-1 flex-col min-h-0"
              style="--loading-indicator-width:50%"
            >
              <LogicScriptEditor filename="main.sd" />
            </div>
            <div key="scripts" class="flex flex-1 flex-col min-h-0">
              <FileList
                include="*.{sd}"
                exclude="main.sd"
                emptyState={
                  <FileListBorder>
                    <Book class="size-12 m-2" />
                    <span class="text-sm">No Scripts</span>
                  </FileListBorder>
                }
              />
            </div>
          </Router>
          {/* FAB anchored at the bottom — pulled out of the sliding
              Router (same pattern as Assets) so it doesn't move with
              the panel content. Only relevant on the Scripts list view;
              on Main it fades out. (The editor route is a separate fade
              branch, so the FAB never renders there.)

              The fade-IN is delayed 150ms (the duration of the panel's
              slide+fade transition) so the FAB doesn't appear over the
              previous panel's content mid-slide — it waits until the
              new panel is fully in place, then fades in. The fade-OUT
              has no delay so the FAB clears immediately as soon as the
              user navigates away. */}
          <div class="pointer-events-none absolute inset-x-0 bottom-0 h-24 [&_button]:pointer-events-auto">
            <div
              class={`transition-opacity duration-200 ${
                panel === "scripts"
                  ? "opacity-100 delay-150"
                  : "pointer-events-none opacity-0"
              }`}
            >
              <FileAddButton defaultFilename="script00.sd">
                New Script
              </FileAddButton>
            </div>
          </div>
        </div>
      </div>
      <div key="editor" class="relative flex flex-col flex-1 min-h-0">
        <LogicScriptsEditor />
      </div>
    </Router>
  );
}
