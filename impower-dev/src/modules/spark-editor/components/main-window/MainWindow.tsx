import { LiveRegion, SplitPane } from "@impower/impower-ui/components";
import { useLayout } from "@impower/impower-ui/layout";
import type { PaneType } from "@impower/spark-editor-protocol/src/types";
import { useComputed } from "@preact/signals";
import workspace from "../../workspace/WorkspaceStore";
import { inspectedAsset } from "../../utils/assetInspector";
import AssetInspectorPane from "../asset-inspector/AssetInspectorPane";
import Assets from "../assets/Assets";
import {
  DesktopShell,
  PhonePreviewBack,
  PhoneShell,
  useFocusRule,
} from "../desktop-shell";
import FileDropzone from "../file-dropzone/FileDropzone";
import Logic from "../logic/Logic";
import Preview from "../preview/Preview";
import { SettingsPage } from "../settings";
import { SharePage } from "../share";
import { useWorkspaceSession } from "./useWorkspaceSession";

export const propDefaults = {};
export type MainWindowProps = Partial<typeof propDefaults>;

function PaneContent({ pane, settings }: { pane: PaneType; settings: boolean }) {
  if (settings) return <SettingsPage key="settings" />;
  if (pane === "assets") return <Assets key="assets" />;
  if (pane === "share") return <SharePage key="share" />;
  return <Logic key="logic" />;
}

const STRIP_HEIGHT = {
  default: 280,
  min: 200,
  collapsed: 48,
  reserve: 240,
} as const;

export default function MainWindow(_props: MainWindowProps) {
  useWorkspaceSession();
  useFocusRule();
  const layout = useLayout();
  const isSSR = typeof window === "undefined";
  const desktop = !isSSR && layout === "desktop";
  const phone = isSSR || layout === "phone";
  const strip = !isSSR && layout === "compact";
  const pane = workspace.signals.pane.value as PaneType;
  const settings = useComputed(
    () => !!workspace.state.value.screen?.settingsOpen,
  ).value;
  const previewActive = useComputed(() =>
    workspace.state.value.preview?.revealed ? "end" : "start",
  ).value;
  const stripHeight = useComputed(
    () => workspace.state.value.shell?.stripHeight,
  ).value;

  const onStripHeightChange = async (height: number | undefined) => {
    const { Workspace } = await import("../../workspace/Workspace");
    Workspace.window.setStripHeight(height);
  };

  const panes = (
    <div class="relative flex h-full min-h-0 flex-1">
      {!isSSR && (
        <>
          <SplitPane
            orientation={strip ? "vertical" : "horizontal"}
            reverse={strip}
            label={strip ? "Resize preview" : undefined}
            pinned={
              strip
                ? {
                    panel: "end",
                    size: stripHeight,
                    defaultSize: STRIP_HEIGHT.default,
                    minSize: STRIP_HEIGHT.min,
                    collapsedSize: STRIP_HEIGHT.collapsed,
                    reserve: STRIP_HEIGHT.reserve,
                    onSizeChange: onStripHeightChange,
                  }
                : undefined
            }
            activePanel={previewActive}
            defaultSizes={[53, 47]}
            minSize={desktop ? ["280px", "336px"] : "320px"}
            start={
              <div class="relative flex h-full w-full flex-col">
                <PaneContent pane={pane} settings={settings} />
              </div>
            }
            end={
              <div class="relative flex h-full w-full flex-col bg-stage">
                {phone && <PhonePreviewBack />}
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
          <LiveRegion />
        </>
      )}
    </div>
  );

  if (phone) {
    return <PhoneShell>{panes}</PhoneShell>;
  }

  return (
    <div class="flex h-full w-full min-h-0 flex-col">
      <DesktopShell>{panes}</DesktopShell>
    </div>
  );
}
