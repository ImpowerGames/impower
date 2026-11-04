import {
  Book,
  BookClosed,
  Router,
  Tab,
  Tabs,
} from "@impower/impower-ui/components";
import { startTransition } from "preact/compat";
import { useState } from "preact/hooks";
import { SCRIPT_FILES_GLOB } from "../../utils/scriptFiles";
import { useDiagnosticColor } from "../../workspace/useDiagnosticColor";
import workspace from "../../workspace/WorkspaceStore";
import FileAddButton from "../file-list/FileAddButton";
import FileList from "../file-list/FileList";
import FileListBorder from "../file-list/FileListBorder";
import LogicScriptEditor from "../logic-script-editor/LogicScriptEditor";
import LogicScriptsEditor from "../logic-scripts-editor/LogicScriptsEditor";
import type { PanelType } from "@impower/spark-editor-protocol/src/types";

export const propDefaults = {};
export type LogicListProps = Partial<typeof propDefaults>;

type Panel = "main" | "scripts";

export default function LogicList(_props: LogicListProps) {
  const state = workspace.state.value;
  const panel = (state.panes?.logic?.panel || "main") as Panel;
  const mainColor = useDiagnosticColor("main.sd");
  const scriptsColor = useDiagnosticColor();
  const scriptsActiveEditor = state.panes?.logic?.panels?.scripts?.activeEditor;
  const showScriptsEditor =
    !!scriptsActiveEditor?.open && !!scriptsActiveEditor?.filename;

  const [fabCollapsed, setFabCollapsed] = useState(false);
  const [scriptsScope, setScriptsScope] = useState("scripts");

  const onPanelChange = (next: string) => {
    startTransition(() => {
      void import("../../workspace/Workspace").then(({ Workspace }) => {
        Workspace.window.openPanel("logic", next as PanelType);
      });
    });
  };

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

        <div class="relative flex flex-col flex-1 min-h-0">
          <Router active={panel} mode="slide-x">

            <div
              key="main"
              class="flex flex-1 flex-col min-h-0"
              style="--loading-indicator-width:50%"
            >
              <LogicScriptEditor filename="main.sd" />
            </div>
            <div key="scripts" class="flex flex-1 flex-col min-h-0">
              <FileList
                rootDir="scripts"
                include={SCRIPT_FILES_GLOB}
                exclude="main.sd"
                onScrolledChange={setFabCollapsed}
                onScopeChange={setScriptsScope}
                emptyState={
                  <FileListBorder>
                    <Book class="size-12 m-2" />
                    <span class="text-sm">No Scripts</span>
                  </FileListBorder>
                }
              />
            </div>
          </Router>

          <div class="pointer-events-none absolute inset-x-0 bottom-0 h-24">
            <div
              class={`transition-opacity duration-200 ${
                panel === "scripts"
                  ? "opacity-100 delay-150 [&_button]:pointer-events-auto"
                  : "opacity-0"
              }`}
            >
              <FileAddButton
                defaultFilename="script00.sd"
                collapsed={fabCollapsed}
                targetDir={scriptsScope}
                deferred
              >
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
