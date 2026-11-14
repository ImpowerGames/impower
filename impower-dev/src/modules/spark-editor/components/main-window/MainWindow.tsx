import { LiveRegion, SplitPane } from "@impower/impower-ui/components";
import {
  useCoarsePointer,
  useKeyboardFit,
  useLayout,
} from "@impower/impower-ui/layout";
import type { PaneType } from "@impower/spark-editor-protocol/src/types";
import { useComputed } from "@preact/signals";
import { WorkspaceConstants } from "../../workspace/WorkspaceConstants";
import workspace from "../../workspace/WorkspaceStore";
import { InspectorDock, InspectorDockProvider } from "../asset-inspector";
import Assets from "../assets";
import { DesktopShell, PhoneShell, useFocusRule } from "../desktop-shell";
import FileDropzone from "../file-dropzone/FileDropzone";
import { useFindShortcut } from "../find-references-rename";
import Logic from "../logic/Logic";
import Preview from "../preview/Preview";
import { PhonePreviewStrip } from "../preview-strip";
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

const STRIP_HEIGHT = WorkspaceConstants.PREVIEW_STRIP_HEIGHT;

export default function MainWindow(_props: MainWindowProps) {
  useWorkspaceSession();
  useFocusRule();
  useFindShortcut();
  useKeyboardFit(useCoarsePointer());
  const layout = useLayout();
  const isSSR = typeof window === "undefined";
  const desktop = !isSSR && layout === "desktop";
  const phone = isSSR || layout === "phone";
  const strip = !isSSR && layout === "compact";
  const pane = workspace.signals.pane.value as PaneType;
  const settings = useComputed(
    () => !!workspace.state.value.screen?.settingsOpen,
  ).value;
  const stripHeight = useComputed(
    () => workspace.state.value.shell?.stripHeight,
  ).value;

  const onStripHeightChange = async (height: number | undefined) => {
    const { Workspace } = await import("../../workspace/Workspace");
    Workspace.window.setStripHeight(height);
  };

  const content = (
    <div class="relative flex h-full w-full flex-col">
      <PaneContent pane={pane} settings={settings} />
    </div>
  );

  if (phone) {
    return (
      <PhoneShell strip={<PhonePreviewStrip />}>
        <div class="relative flex h-full min-h-0 flex-1">
          {!isSSR && (
            <InspectorDockProvider>
              {content}
              <FileDropzone />
              <LiveRegion />
            </InspectorDockProvider>
          )}
        </div>
      </PhoneShell>
    );
  }

  return (
    <div class="flex h-full w-full min-h-0 flex-col">
      <DesktopShell>
        <div class="relative flex h-full min-h-0 flex-1">
          <InspectorDockProvider>
            <SplitPane
              orientation={strip ? "vertical" : "horizontal"}
              reverse={strip}
              label={strip ? "Resize preview" : undefined}
              class="[--split-start-surface:var(--color-workspace)] [--split-end-surface:var(--color-preview-mat)]"
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
              defaultSizes={[53, 47]}
              minSize={desktop ? ["280px", "336px"] : "320px"}
              start={content}
              end={
                <div class="relative flex h-full w-full flex-col bg-stage">
                  <Preview />
                  <InspectorDock />
                </div>
              }
            />
            <FileDropzone />
            <LiveRegion />
          </InspectorDockProvider>
        </div>
      </DesktopShell>
    </div>
  );
}
