import {
  ArtIcon,
  BookIcon,
  CogIcon,
  ShareIcon,
  Tab,
  Tabs,
} from "@impower/impower-ui/components";
import type { PaneType } from "@impower/spark-editor-protocol/src/types";
import { routeOfPane } from "../../workspace/routes";
import workspace from "../../workspace/WorkspaceStore";
import Outline from "../outline";
import { SettingsIndex } from "../settings";
import AppMenu from "./AppMenu";
import { SCREEN_PANEL_ID, SETTINGS_TAB } from "./screenPanel";

export default function ShellRail() {
  const pane = workspace.signals.pane.value;
  const settings = !!workspace.state.value.screen?.settingsOpen;

  const onChange = async (next: string) => {
    const { Workspace } = await import("../../workspace/Workspace");
    Workspace.window.navigateTo(
      next === SETTINGS_TAB ? "settings" : routeOfPane(next as PaneType),
    );
  };

  return (
    <aside
      aria-label="Sidebar"
      class="flex h-full min-h-0 flex-col border-r border-edge bg-bg"
    >
      <nav
        aria-label="Story, Assets and Share"
        class="flex-none border-b border-edge px-[14px] pt-[22px] pb-5 in-data-[layout=compact]:px-[10px] in-data-[layout=compact]:pt-4 group-data-[sidebar=collapsed]/sidebar:px-[5px] group-data-[sidebar=collapsed]/sidebar:pt-3.5"
      >
        <Tabs
          panel={SCREEN_PANEL_ID}
          value={settings ? "" : pane}
          onChange={onChange}
          variant="rail"
          vertical
          iconLayout="beside"
          indicator="none"
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
      </nav>
      <div data-outline class="flex min-h-0 flex-1 flex-col">
        {settings ? <SettingsIndex /> : <Outline />}
      </div>
      <nav
        aria-label="Settings"
        class="flex-none border-t border-edge px-[14px] py-2 in-data-[layout=compact]:px-[10px] group-data-[sidebar=collapsed]/sidebar:px-[5px]"
      >
        <Tabs
          panel={SCREEN_PANEL_ID}
          value={settings ? SETTINGS_TAB : ""}
          onChange={onChange}
          variant="rail"
          vertical
          iconLayout="beside"
          indicator="none"
        >
          <Tab value={SETTINGS_TAB} icon={CogIcon}>
            Settings
          </Tab>
        </Tabs>
      </nav>
      <div class="flex h-[62px] flex-none items-center border-t compact:h-[52px] border-edge px-[14px] group-data-[sidebar=collapsed]/sidebar:justify-center group-data-[sidebar=collapsed]/sidebar:px-0">
        <AppMenu />
      </div>
    </aside>
  );
}
