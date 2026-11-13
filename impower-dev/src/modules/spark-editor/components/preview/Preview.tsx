import { cn, SplitPane } from "@impower/impower-ui/components";
import { useLayout } from "@impower/impower-ui/layout";
import { useEffect, useRef, useState } from "preact/hooks";
import problems from "../../workspace/problems/ProblemsStore";
import workspaceSettings from "../../workspace/settings/WorkspaceSettings";
import {
  playsGame,
  PROJECT_SETTINGS_SCHEMA,
  type PreviewMode,
} from "../../workspace/settings/settingsSchema";
import workspace from "../../workspace/WorkspaceStore";
import { PreviewBar } from "../preview-bar";
import { ProblemsPanel } from "../problems";
import PreviewGame from "../preview-game/PreviewGame";
import { RoutePanel } from "../preview-route";
import PreviewScreenplay from "../preview-screenplay/PreviewScreenplay";
import PreviewTopBar from "../preview-top-bar/PreviewTopBar";
import PreviewStatuses from "./PreviewStatuses";

export const propDefaults = {};
export type PreviewProps = Partial<typeof propDefaults>;

const BAR_HEIGHT = PROJECT_SETTINGS_SCHEMA.previewPanelHeight.default;
const PANEL_MIN_HEIGHT = 144;
const STAGE_MIN_HEIGHT = 160;

const playerClass = (mode: PreviewMode, choosing: boolean) => {
  if (playsGame(mode)) {
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
  const inStrip = phone && !workspace.state.value.preview?.revealed;
  const framed = !fullscreen && !inStrip;

  const stage = (
    <>
      <div
        class={playerClass(mode, choosing)}
        data-choosing={!playsGame(mode) && choosing ? "" : undefined}
      >
        <PreviewGame />
      </div>
      {mode === "screenplay" ? <PreviewScreenplay /> : null}
      {inStrip ? null : <PreviewStatuses mode={mode} />}
    </>
  );

  const card = (
    <div
      class={cn(
        "flex min-h-0 flex-1 flex-col",
        framed && "px-preview-inline pt-preview-stage-gap",
      )}
    >
      <div
        data-preview-card
        class={cn(
          "relative isolate flex min-h-0 flex-1 flex-col overflow-hidden bg-stage",
          framed && "rounded-preview-frame shadow-preview-frame",
        )}
      >
        {stage}
      </div>
    </div>
  );

  const closeFullView = async () => {
    const { Workspace } = await import("../../workspace/Workspace");
    Workspace.window.collapsePreviewPane();
  };

  const bar = (
    <PreviewBar
      fullscreen={fullscreen}
      onToggleFullscreen={toggle}
      onClose={phone ? () => void closeFullView() : undefined}
    />
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
      class={cn(
        "@container flex h-full w-full min-h-0 flex-1 flex-col bg-preview-mat",
        phone && !inStrip && "pb-[env(safe-area-inset-bottom)]",
      )}
    >
      {inStrip ? null : <PreviewTopBar />}
      {phone ? (
        <>
          {card}
          {inStrip ? null : bar}
        </>
      ) : (
        <SplitPane
          orientation="vertical"
          label="Resize game and panel"
          overflowPanel="start"
          pinned={{
            panel: "end",
            size: panelHeight,
            defaultSize: BAR_HEIGHT,
            minSize: PANEL_MIN_HEIGHT,
            collapsedSize: BAR_HEIGHT,
            reserve: STAGE_MIN_HEIGHT,
            onSizeChange: onPanelHeightChange,
          }}
          start={<div class="flex h-full flex-col">{card}</div>}
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
