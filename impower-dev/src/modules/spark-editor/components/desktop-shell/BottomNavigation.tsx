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
import { cn } from "../../../../../../packages/impower-ui/src/utils/cn";
import { routeOfPane, routeOfState } from "../../workspace/routes";
import workspace from "../../workspace/WorkspaceStore";
import { useNaming } from "./naming";

export default function BottomNavigation() {
  const naming = useNaming() !== null;
  const sheetOpen = useSheetOpen();
  const current = useComputed(() =>
    routeOfState(workspace.state.value) === "project"
      ? ""
      : workspace.signals.pane.value,
  ).value;

  const onChange = async (next: string) => {
    const { Workspace } = await import("../../workspace/Workspace");
    Workspace.window.navigateTo(routeOfPane(next as PaneType));
  };

  return (
    <nav
      aria-label="Project"
      data-bottom-navigation
      hidden={naming || sheetOpen}
      class={cn(
        "min-h-[65px] flex-none border-t border-edge bg-panel pb-[env(safe-area-inset-bottom)]",
        "[.keyboard-open_&]:hidden",
      )}
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
