import {
  Button,
  DetourIcon,
  DropdownContent,
  DropdownRoot,
  DropdownTrigger,
  ExpandIcon,
  PinIcon,
  ScissorsIcon,
  SettingsIcon,
  ShrinkIcon,
  StopSignIcon,
  WarningIcon,
} from "@impower/impower-ui/components";
import { useLayout, type Layout } from "@impower/impower-ui/layout";
import type { GameSize } from "@impower/spark-editor-protocol/src/types";
import { useComputed } from "@preact/signals";
import route from "../../workspace/route/RouteStore";
import workspace from "../../workspace/WorkspaceStore";
import workspaceSettings from "../../workspace/settings/WorkspaceSettings";
import { ProblemsToggle } from "../problems";
import { ROUTE_PANEL_ID } from "../preview-route";
import { settingsSectionHref } from "../settings";
import { AspectRatioGroup } from "./AspectRatioGroup";
import {
  ASPECT_RATIO_LABEL_RESERVES,
  aspectRatioLabel,
  barReadout,
  type AspectRatioChoice,
  PAGE_FILLS_PANE,
  PAPER_SIZE_LABELS,
  sizeControl,
  stopNote,
} from "./barState";

export interface PreviewBarProps {
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}

const BAR_TEXT = "text-[11px]/[1.4] font-semibold tabular-nums";

export default function PreviewBar({
  fullscreen,
  onToggleFullscreen,
}: PreviewBarProps) {
  const layout = useLayout();
  const size = sizeControl(workspaceSettings.preferences.value.previewMode);
  return (
    <div
      role="group"
      aria-label="Problems and display"
      class="flex h-11 shrink-0 items-center gap-1 px-2"
    >
      <ProblemsToggle />
      <RouteReadout layout={layout} />
      {size === "paper" ? (
        <PaperSizeLink />
      ) : layout === "phone" ? null : (
        <AspectRatioMenu pageFillsPane={size === "pageFillsPane"} />
      )}
      <Button
        variant="quiet"
        size="icon"
        aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen preview"}
        title={fullscreen ? "Exit fullscreen" : "Fullscreen preview"}
        class="text-muted"
        onClick={onToggleFullscreen}
      >
        {fullscreen ? <ShrinkIcon /> : <ExpandIcon />}
      </Button>
    </div>
  );
}

const READOUT_ICONS = {
  forced: <DetourIcon data-icon="detour" class="text-warning" />,
  clipped: <ScissorsIcon data-icon="scissors" class="text-warning" />,
  pinned: <PinIcon data-icon="pin" class="text-accent" />,
  failure: <WarningIcon data-icon="warning" class="text-error" />,
  stopped: <StopSignIcon data-icon="stop-sign" class="text-warning" />,
};

function RouteReadout({ layout }: { layout: Layout }) {
  const readout = barReadout(
    workspace.state.value,
    route.view.value,
    workspace.debugSession.value,
    layout,
  );
  const open = useComputed(() => route.open.value).value;
  const note =
    layout === "phone" ? null : stopNote(workspace.debugSession.value);

  const onClick = async () => {
    if (!readout) return;
    if (readout.opensRoute) {
      route.toggle();
      return;
    }
    const { Workspace } = await import("../../workspace/Workspace");
    const uri =
      readout.uri ?? Workspace.window.getActiveEditorForPane("logic")?.uri;
    if (!uri) return;
    const at = { line: readout.line, character: 0 };
    void Workspace.window.revealDocument(uri, { start: at, end: at });
  };

  return (
    <div class="flex min-w-0 flex-1 items-center justify-end">
      {note ? (
        <span
          title={note}
          class={`min-w-0 flex-1 basis-0 truncate text-right text-muted ${BAR_TEXT}`}
        >
          {note}
        </span>
      ) : null}
      {readout ? (
        <Button
          variant="quiet"
          title={readout.title}
          aria-label={
            readout.opensRoute
              ? `${readout.name} ${readout.lines}. ${readout.title}`
              : readout.stopped
                ? `${readout.name}. ${readout.title}`
                : undefined
          }
          aria-expanded={readout.opensRoute ? open : undefined}
          aria-controls={readout.opensRoute ? ROUTE_PANEL_ID : undefined}
          data-failed={readout.failed ? "" : undefined}
          data-stopped={readout.stopped ? "" : undefined}
          class={`max-w-full min-w-0 justify-end gap-1.5 px-2.5 text-muted data-failed:text-error data-stopped:text-warning ${BAR_TEXT}`}
          onClick={onClick}
        >
          {readout.icon ? (
            READOUT_ICONS[readout.icon]
          ) : readout.opensRoute ? (
            <span data-icon-slot aria-hidden="true" class="size-[18px] shrink-0" />
          ) : null}
          <span class="min-w-0 overflow-hidden whitespace-nowrap @max-[360px]:fade-edge">
            {readout.name}
          </span>
          {readout.lines ? (
            <span class="shrink-0 font-normal">{readout.lines}</span>
          ) : null}
        </Button>
      ) : null}
    </div>
  );
}

function RatioLabel({
  choice,
  size,
}: {
  choice: AspectRatioChoice;
  size: GameSize | undefined;
}) {
  const [reserve, reserveAlt] = ASPECT_RATIO_LABEL_RESERVES;
  return (
    <span
      data-reserve={reserve}
      data-reserve-alt={reserveAlt}
      class="inline-grid justify-items-end before:invisible before:content-[attr(data-reserve-alt)] before:[grid-area:1/1] after:invisible after:content-[attr(data-reserve)] after:[grid-area:1/1] [&>*]:[grid-area:1/1]"
    >
      <span>{aspectRatioLabel(choice, size)}</span>
    </span>
  );
}

function AspectRatioMenu({ pageFillsPane }: { pageFillsPane: boolean }) {
  const choice = workspaceSettings.projectSettings.value.previewAspectRatio;
  const size = useComputed(
    () => workspace.state.value.preview?.modes?.game?.size,
  ).value;

  if (pageFillsPane) {
    return (
      <Button
        variant="quiet"
        aria-label="Game aspect ratio"
        aria-disabled
        title={PAGE_FILLS_PANE}
        class={`px-2.5 text-muted aria-disabled:cursor-default aria-disabled:opacity-40 ${BAR_TEXT}`}
      >
        <RatioLabel choice="auto" size={size} />
      </Button>
    );
  }

  return (
    <DropdownRoot>
      <DropdownTrigger asChild>
        <Button
          variant="quiet"
          aria-label="Game aspect ratio"
          title="Game aspect ratio"
          class={`px-2.5 text-muted ${BAR_TEXT}`}
        >
          <RatioLabel choice={choice} size={size} />
        </Button>
      </DropdownTrigger>
      <DropdownContent side="top" align="end" class="min-w-[210px]">
        <AspectRatioGroup />
      </DropdownContent>
    </DropdownRoot>
  );
}

function PaperSizeLink() {
  const paper = workspaceSettings.projectSettings.value.screenplayPaperSize;
  return (
    <Button
      asChild
      variant="quiet"
      class={`gap-1.5 px-2.5 text-muted ${BAR_TEXT}`}
    >
      <a
        href={settingsSectionHref("screenplay-settings")}
        aria-label="Screenplay settings"
        title="Screenplay settings"
        onClick={() => {
          if (document.fullscreenElement) {
            void document.exitFullscreen();
          }
        }}
      >
        <SettingsIcon />
        <span>{PAPER_SIZE_LABELS[paper]}</span>
      </a>
    </Button>
  );
}
