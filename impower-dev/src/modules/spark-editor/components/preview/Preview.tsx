import { SplitPane } from "@impower/impower-ui/components";
import { useLayout } from "@impower/impower-ui/layout";
import { useEffect, useRef, useState } from "preact/hooks";
import problems from "../../workspace/problems/ProblemsStore";
import workspaceSettings from "../../workspace/settings/WorkspaceSettings";
import { PROJECT_SETTINGS_SCHEMA } from "../../workspace/settings/settingsSchema";
import workspace from "../../workspace/WorkspaceStore";
import PreviewBar from "../preview-bar/PreviewBar";
import { ProblemsPanel } from "../problems";
import PreviewGame from "../preview-game/PreviewGame";
import { RoutePanel } from "../preview-route";
import PreviewScreenplay from "../preview-screenplay/PreviewScreenplay";
import PreviewTopBar from "../preview-top-bar/PreviewTopBar";

export const propDefaults = {};
export type PreviewProps = Partial<typeof propDefaults>;

const BAR_HEIGHT = PROJECT_SETTINGS_SCHEMA.previewPanelHeight.default;
const PANEL_MIN_HEIGHT = 144;
const STAGE_MIN_HEIGHT = 160;

const playerClass = (mode: string, choosing: boolean) => {
  if (mode === "game") {
    return "contents";
  }
  return choosing ? "absolute inset-0 z-[2] flex flex-col bg-stage" : "hidden";
};

function useFullscreen() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () =>
      setFullscreen(
        !!ref.current && document.fullscreenElement === ref.current,
      );
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggle = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void ref.current?.requestFullscreen();
    }
  };
  return { ref, fullscreen, toggle };
}

export default function Preview(_props: PreviewProps) {
  const mode = workspaceSettings.preferences.value.previewMode;
  const layout = useLayout();
  const phone = layout === "phone";
  const panelHeight = workspaceSettings.projectSettings.value.previewPanelHeight;
  const panelShows = problems.panelShows.value;
  useEffect(() => {
    if (layout === "compact" && panelHeight > BAR_HEIGHT) {
      problems.makeRoomInStrip();
    }
  }, [layout, panelHeight]);
  const { ref, fullscreen, toggle } = useFullscreen();

  const game = workspace.state.value.preview?.modes?.game;
  const choosing = !!game?.running && !!game?.choosing;

  const stage = (
    <>
      <div
        class={playerClass(mode, choosing)}
        data-choosing={mode !== "game" && choosing ? "" : undefined}
      >
        <PreviewGame />
      </div>
      {mode === "screenplay" ? <PreviewScreenplay /> : null}
    </>
  );

  const bar = (
    <PreviewBar fullscreen={fullscreen} onToggleFullscreen={toggle} />
  );

  const onPanelHeightChange = (height: number | undefined) => {
    if (height != null) {
      problems.rememberPanelHeight(height);
    }
    workspaceSettings.setProjectSetting(
      "previewPanelHeight",
      height ?? BAR_HEIGHT,
    );
  };

  return (
    <div
      ref={ref}
      class="@container flex h-full w-full min-h-0 flex-1 flex-col bg-panel"
    >
      <PreviewTopBar />
      {phone ? (
        <>
          <div class="relative flex min-h-0 flex-1 flex-col bg-stage">{stage}</div>
          {bar}
        </>
      ) : (
        <SplitPane
          orientation="vertical"
          label="Resize game and panel"
          pinned={{
            panel: "end",
            size: panelHeight,
            defaultSize: BAR_HEIGHT,
            minSize: PANEL_MIN_HEIGHT,
            collapsedSize: BAR_HEIGHT,
            reserve: STAGE_MIN_HEIGHT,
            onSizeChange: onPanelHeightChange,
          }}
          start={<div class="relative flex h-full flex-col bg-stage">{stage}</div>}
          end={
            <div class="flex h-full flex-col">
              {bar}
              <div data-preview-panel class="min-h-0 flex-1">
                {panelHeight <= BAR_HEIGHT ? null : panelShows === "route" ? (
                  <RoutePanel />
                ) : (
                  <ProblemsPanel />
                )}
              </div>
            </div>
          }
        />
      )}
    </div>
  );
}
