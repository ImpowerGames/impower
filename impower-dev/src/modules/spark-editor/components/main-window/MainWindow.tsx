import { LiveRegion, SplitPane } from "@impower/impower-ui/components";
import {
  useCoarsePointer,
  useKeyboardFit,
  useLayout,
} from "@impower/impower-ui/layout";
import type { PaneType } from "@impower/spark-editor-protocol/src/types";
import { useComputed } from "@preact/signals";
import { useScriptFocus } from "../../utils/useScriptFocus";
import { routeOfState, type Route } from "../../workspace/routes";
import { WorkspaceConstants } from "../../workspace/WorkspaceConstants";
import workspace from "../../workspace/WorkspaceStore";
import { InspectorDock, InspectorDockProvider } from "../asset-inspector";
import Assets from "../assets";
import { useFocusRule, WorkspaceShell } from "../desktop-shell";
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

const PANE_DIVIDER_LABELS: Record<Route, string> = {
  story: "Resize script and preview panes",
  scripts: "Resize scripts and preview panes",
  assets: "Resize page and preview panes",
  share: "Resize page and preview panes",
  settings: "Resize page and preview panes",
};

export default function MainWindow(_props: MainWindowProps) {
  useWorkspaceSession();
  useFocusRule();
  useFindShortcut();
  const keyboard = useKeyboardFit(useCoarsePointer());
  const writing = useScriptFocus();
  const scriptOnly =
    writing &&
    keyboard.open &&
    keyboard.visibleHeight < WorkspaceConstants.SCRIPT_ONLY_BELOW_HEIGHT;
  const layout = useLayout();
  const isSSR = typeof window === "undefined";
  const desktop = !isSSR && layout === "desktop";
  const phone = isSSR || layout === "phone";
  const pane = workspace.signals.pane.value as PaneType;
  const settings = useComputed(
    () => !!workspace.state.value.screen?.settingsOpen,
  ).value;
  const route = useComputed(() => routeOfState(workspace.state.value)).value;

  const content = (
    <main data-toast-pane class="relative flex h-full w-full flex-col">
      <PaneContent pane={pane} settings={settings} />
    </main>
  );

  return (
    <WorkspaceShell
      phone={phone}
      strip={!desktop && <PhonePreviewStrip size={phone ? "phone" : "tablet"} />}
      scriptOnly={scriptOnly}
    >
      <div class="relative flex h-full min-h-0 flex-1">
        {!isSSR && (
          <InspectorDockProvider>
            <SplitPane
              solo={scriptOnly || !desktop}
              label={PANE_DIVIDER_LABELS[route]}
              class="[--split-start-surface:var(--color-workspace)] [--split-end-surface:var(--color-preview-mat)]"
              defaultSizes={[53, 47]}
              minSize={["280px", "336px"]}
              start={content}
              end={
                desktop && (
                  <aside
                    aria-label="Preview"
                    class="relative flex h-full w-full flex-col bg-stage"
                  >
                    <Preview />
                    <InspectorDock />
                  </aside>
                )
              }
            />
            <FileDropzone />
            <LiveRegion />
          </InspectorDockProvider>
        )}
      </div>
    </WorkspaceShell>
  );
}
