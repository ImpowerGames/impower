import {
  Bolt,
  BoltFill,
  Photo,
  PhotoFill,
  Share,
  ShareFill,
  SplitPane,
  Tab,
  Tabs,
} from "@impower/impower-ui/components";
import { useLayout } from "@impower/impower-ui/layout";
import type { PaneType } from "@impower/spark-editor-protocol/src/types";
import { useComputed } from "@preact/signals";
import { routeOfPane } from "../../workspace/routes";
import workspace from "../../workspace/WorkspaceStore";
import { inspectedAsset } from "../../utils/assetInspector";
import AssetInspectorPane from "../asset-inspector/AssetInspectorPane";
import Assets from "../assets/Assets";
import DesktopShell from "../desktop-shell/DesktopShell";
import FileDropzone from "../file-dropzone/FileDropzone";
import HeaderNavigation from "../header-navigation/HeaderNavigation";
import Logic from "../logic/Logic";
import Preview from "../preview/Preview";
import SharePanel from "../share/Share";
import { useWorkspaceSession } from "./useWorkspaceSession";

export const propDefaults = {};
export type MainWindowProps = Partial<typeof propDefaults>;

function PaneContent({ pane }: { pane: PaneType }) {
  if (pane === "assets") return <Assets key="assets" />;
  if (pane === "share") return <SharePanel key="share" />;
  return <Logic key="logic" />;
}

export default function MainWindow(_props: MainWindowProps) {
  useWorkspaceSession();
  const layout = useLayout();
  const isSSR = typeof window === "undefined";
  const desktop = !isSSR && layout === "desktop";
  const pane = workspace.signals.pane.value as PaneType;
  const previewActive = useComputed(() =>
    workspace.state.value.preview?.revealed ? "end" : "start",
  ).value;

  const onPaneChange = async (next: string) => {
    const { Workspace } = await import("../../workspace/Workspace");
    Workspace.window.navigateTo(routeOfPane(next as PaneType));
  };

  const panes = (
    <div class="relative flex h-full min-h-0 flex-1">
      {!isSSR && (
        <>
          <SplitPane
            activePanel={previewActive}
            defaultSizes={desktop ? [53, 47] : undefined}
            minSize={desktop ? ["280px", "336px"] : "320px"}
            start={
              <div class="relative flex h-full w-full flex-col">
                <PaneContent pane={pane} />
              </div>
            }
            end={
              <div class="relative flex h-full w-full flex-col bg-stage">
                <Preview />
                {pane === "assets" && inspectedAsset.value && (
                  <div class="absolute inset-0 z-10">
                    <AssetInspectorPane />
                  </div>
                )}
              </div>
            }
          />

          <FileDropzone />
        </>
      )}
    </div>
  );

  if (desktop) {
    return (
      <div class="flex h-full w-full min-h-0 flex-col">
        <DesktopShell>{panes}</DesktopShell>
      </div>
    );
  }

  return (
    <div class="flex flex-col w-full h-full min-h-0">
      <HeaderNavigation />
      <div class="relative flex flex-1 min-h-0">{panes}</div>

      <div class="relative flex-none h-[60px] bg-bg text-foreground [&>*]:h-full [.keyboard-open_&]:hidden">

        <div class="absolute inset-x-0 top-0 !h-px bg-edge z-10" />
        {!isSSR && (
          <Tabs value={pane} onChange={onPaneChange} indicator="none">
            <Tab value="logic" icon={Bolt} activeIcon={BoltFill}>
              Logic
            </Tab>
            <Tab value="assets" icon={Photo} activeIcon={PhotoFill}>
              Assets
            </Tab>
            <Tab value="share" icon={Share} activeIcon={ShareFill}>
              Share
            </Tab>
          </Tabs>
        )}
      </div>
    </div>
  );
}
