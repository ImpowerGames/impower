import { Book, BookClosed, Tab, Tabs } from "@impower/impower-ui/components";
import { startTransition } from "preact/compat";
import workspace from "../../workspace/WorkspaceStore";
import FileAddButton from "../file-list/FileAddButton";
import FileList from "../file-list/FileList";
import FileListBorder from "../file-list/FileListBorder";

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
  // The Scripts panel switches between two sub-views:
  //   - list view (shows the FileList of *.sd files)
  //   - editor view (shows the active script in <se-logic-scripts-editor>)
  // The legacy logic-scripts-list rendered just the list and relied on a
  // higher-level router driven by 'changing'/'changed' bubbling events to
  // swap to the editor. Here we read `activeEditor.open` directly — that
  // flag is set by `Workspace.window.openedFileEditor()` and cleared by
  // `closedFileEditor()`, so back-button + click flows just work.
  const scriptsActiveEditor =
    state.panes?.logic?.panels?.scripts?.activeEditor;
  const showScriptsEditor =
    !!scriptsActiveEditor?.open && !!scriptsActiveEditor?.filename;

  const onPanelChange = (next: string) => {
    startTransition(() => {
      void import("../../workspace/Workspace").then(({ Workspace }) => {
        Workspace.window.openedPanel("logic", next);
      });
    });
  };

  return (
    <>
      <style>{`
        /* Legacy spec-components default to inline display, which collapses
           to 0×0 inside our flex container. Make them fill the available
           space the same way <se-logic-script-editor> does for main. */
        se-logic-scripts-editor {
          display: flex;
          flex-direction: column;
          width: 100%;
          height: 100%;
          flex: 1 1 0%;
          min-height: 0;
        }
      `}</style>
      {/* Hide Main / Scripts sub-tabs while viewing a script in the editor.
          The legacy <s-router> implicitly did this — the "logic-editor"
          route had its own header (<se-file-editor-navigation> with a
          back button), so the panel tabs went away. */}
      {!showScriptsEditor && (
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
      )}
      {/* `flex flex-col` (not just `block`) — the legacy spec-component
          children inside use sparkle's `grow` attribute (= flex:1), which
          needs a flex parent to fill the available height. Without it,
          se-logic-script-editor's inner s-box collapses to 0 height and
          CodeMirror renders invisible. */}
      <div class="relative flex flex-col flex-1 min-h-0">
        {/* @ts-expect-error legacy custom element */}
        {panel === "main" && <se-logic-script-editor filename="main.sd" style="--loading-indicator-width:50%" />}
        {panel === "scripts" && showScriptsEditor && (
          /* @ts-expect-error legacy custom element */
          <se-logic-scripts-editor />
        )}
        {panel === "scripts" && !showScriptsEditor && (
          <FileList
            include="*.{sd}"
            exclude="main.sd"
            emptyState={
              <FileListBorder>
                <Book class="size-12 m-2" />
                <span class="text-sm">No Scripts</span>
              </FileListBorder>
            }
            action={
              <FileAddButton defaultFilename="script00.sd">
                New Script
              </FileAddButton>
            }
          />
        )}
      </div>
    </>
  );
}
