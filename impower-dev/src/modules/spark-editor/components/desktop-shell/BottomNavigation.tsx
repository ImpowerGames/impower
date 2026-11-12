import {
  ArtIcon,
  BookIcon,
  ShareIcon,
  Tab,
  Tabs,
} from "@impower/impower-ui/components";
import { useSheetOpen } from "@impower/impower-ui/layout";
import type { PaneType } from "@impower/spark-editor-protocol/src/types";
import { useComputed } from "@preact/signals";
import { routeOfPane, routeOfState } from "../../workspace/routes";
import { useScriptMode } from "../../workspace/useActiveEditor";
import workspace from "../../workspace/WorkspaceStore";
import { useNaming } from "./naming";
import { withWindow } from "./workspaceWindow";

export default function BottomNavigation() {
  const naming = useNaming() !== null;
  const sheetOpen = useSheetOpen();
  const editing = useScriptMode() === "editing";
  const panelOpen = useComputed(
    () => workspace.keyboardPanels.value.length > 0,
  ).value;
  const current = useComputed(() =>
    routeOfState(workspace.state.value) === "project"
      ? ""
      : workspace.signals.pane.value,
  ).value;

  const onChange = (next: string) =>
    void withWindow((win) => win.navigateTo(routeOfPane(next as PaneType)));

  return (
    <nav
      aria-label="Project"
      data-bottom-navigation
      hidden={naming || sheetOpen || editing || panelOpen}
      class="min-h-[65px] flex-none border-t border-edge bg-panel pb-[env(safe-area-inset-bottom)] [.keyboard-open_&]:hidden"
    >
      {typeof window !== "undefined" && (
        <Tabs
          value={current}
          onChange={onChange}
          variant="bar"
          indicator="none"
          class="min-h-[64px]"
        >
          <Tab value="logic" icon={BookIcon}>
            Story
          </Tab>
          <Tab value="assets" icon={ArtIcon}>
            Assets
          </Tab>
          <Tab value="share" icon={ShareIcon}>
            Share
          </Tab>
        </Tabs>
      )}
    </nav>
  );
}
