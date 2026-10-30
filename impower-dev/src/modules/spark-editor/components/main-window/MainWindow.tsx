import {
  Bolt,
  BoltFill,
  Photo,
  PhotoFill,
  Router,
  Share,
  ShareFill,
  SplitPane,
  Tab,
  Tabs,
} from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { startTransition } from "preact/compat";
import workspace from "../../workspace/WorkspaceStore";
import { inspectedAsset } from "../../utils/assetInspector";
import AssetInspectorPane from "../asset-inspector/AssetInspectorPane";
import Assets from "../assets/Assets";
import FileDropzone from "../file-dropzone/FileDropzone";
import HeaderNavigation from "../header-navigation/HeaderNavigation";
import Logic from "../logic/Logic";
import Preview from "../preview/Preview";
import SharePanel from "../share/Share";

type PaneType = "logic" | "assets" | "share";

export const propDefaults = {};
export type MainWindowProps = Partial<typeof propDefaults>;

export default function MainWindow(_props: MainWindowProps) {
  const pane = workspace.signals.pane.value as PaneType;
  const workspaceReady = !!workspace.signals.projectId.value;
  const previewActive = useComputed(() =>
    workspace.state.value.preview?.revealed ? "end" : "start",
  ).value;

  const onPaneChange = (next: string) => {
    startTransition(() => {
      void import("../../workspace/Workspace").then(({ Workspace }) => {
        Workspace.window.openPane(next as PaneType);
      });
    });
  };

  const isSSR = typeof window === "undefined";

  return (
    <div class="flex flex-col w-full h-full min-h-0">
      <HeaderNavigation />
      <div class="relative flex flex-1 min-h-0">
        {!isSSR && (
          <>
            <SplitPane
              activePanel={previewActive}
              minSize="320px"
              collapseBelow={960}
              start={
                <div class="relative flex flex-col w-full h-full">
                  <Router active={pane} mode="zoom">
                    <Logic key="logic" />
                    <Assets key="assets" />
                    <SharePanel key="share" />
                  </Router>
                </div>
              }
              end={
                <div class="relative flex flex-col w-full h-full bg-black">

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

      <div class="relative flex-none h-[60px] bg-engine-800 text-foreground [&>*]:h-full [.keyboard-open_&]:hidden">

        <div class="absolute inset-x-0 top-0 !h-px bg-white/[0.06] z-10" />
        <Tabs
          // workaround(@radix-ui/react-tabs): a null or undefined value makes Tabs uncontrolled and briefly activates every trigger, so a non-matching sentinel is passed
          value={workspaceReady ? pane : "__none__"}
          onChange={onPaneChange}
          indicator="none"
        >
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
      </div>
    </div>
  );
}
