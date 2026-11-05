import {
  Book,
  Photo,
  Share,
  Tab,
  Tabs,
} from "@impower/impower-ui/components";
import type { PaneType } from "@impower/spark-editor-protocol/src/types";
import { routeOfPane } from "../../workspace/routes";
import workspace from "../../workspace/WorkspaceStore";
import AppMenu from "./AppMenu";

export default function ShellRail() {
  const pane = workspace.signals.pane.value;

  const onChange = async (next: string) => {
    const { Workspace } = await import("../../workspace/Workspace");
    Workspace.window.navigateTo(routeOfPane(next as PaneType));
  };

  return (
    <aside
      aria-label="Sidebar"
      class="flex h-full min-h-0 flex-col border-r border-edge bg-bg"
    >
      <nav
        aria-label="Story, Assets and Share"
        class="flex-none border-b border-edge px-[14px] pt-[22px] pb-5 group-data-[sidebar=collapsed]/sidebar:px-1.5 group-data-[sidebar=collapsed]/sidebar:pt-3.5"
      >
        <Tabs
          value={pane}
          onChange={onChange}
          variant="rail"
          vertical
          iconLayout="beside"
          indicator="none"
        >
          <Tab value="logic" icon={Book}>
            Story
          </Tab>
          <Tab value="assets" icon={Photo}>
            Assets
          </Tab>
          <Tab value="share" icon={Share}>
            Share
          </Tab>
        </Tabs>
      </nav>
      <div data-outline class="min-h-0 flex-1" />
      <div class="flex h-[62px] flex-none items-center border-t border-edge px-[14px] group-data-[sidebar=collapsed]/sidebar:justify-center group-data-[sidebar=collapsed]/sidebar:px-0">
        <AppMenu />
      </div>
    </aside>
  );
}
