import {
  Button,
  DetourIcon,
  DropdownContent,
  DropdownRadioGroup,
  DropdownRadioItem,
  DropdownRoot,
  DropdownTrigger,
  ExpandIcon,
  PinIcon,
  ScissorsIcon,
  SettingsIcon,
  ShrinkIcon,
  WarningIcon,
} from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import route from "../../workspace/route/RouteStore";
import workspace from "../../workspace/WorkspaceStore";
import workspaceSettings from "../../workspace/settings/WorkspaceSettings";
import { ProblemsToggle } from "../problems";
import { ROUTE_PANEL_ID } from "../preview-route";
import { settingsSectionHref } from "../settings";
import {
  ASPECT_RATIO_ROWS,
  aspectRatioLabel,
  barReadout,
  PAGE_FILLS_PANE,
  PAPER_SIZE_LABELS,
  sizeControl,
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
  const size = sizeControl(workspaceSettings.preferences.value.previewMode);
  return (
    <div
      role="group"
      aria-label="Problems and display"
      class="flex h-11 shrink-0 items-center gap-1 px-2"
    >
      <ProblemsToggle />
      <RouteReadout />
      {size === "paper" ? (
        <PaperSizeLink />
      ) : (
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
};

function RouteReadout() {
  const readout = useComputed(() =>
    barReadout(workspace.state.value, route.view.value),
  ).value;
  const open = useComputed(() => route.open.value).value;

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
    <div class="flex min-w-0 flex-1 justify-end">
      {readout ? (
        <Button
          variant="quiet"
          title={readout.title}
          aria-label={
            readout.opensRoute
              ? `${readout.name} ${readout.lines}. ${readout.title}`
              : undefined
          }
          aria-expanded={readout.opensRoute ? open : undefined}
          aria-controls={readout.opensRoute ? ROUTE_PANEL_ID : undefined}
          data-failed={readout.failed ? "" : undefined}
          class={`max-w-full min-w-0 justify-end gap-1.5 px-2.5 text-muted data-failed:text-error ${BAR_TEXT}`}
          onClick={onClick}
        >
          {readout.icon ? READOUT_ICONS[readout.icon] : null}
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
        {aspectRatioLabel("auto", size)}
      </Button>
    );
  }

  const onValueChange = (value: string) => {
    const row = ASPECT_RATIO_ROWS.find((r) => r.value === value);
    if (row) {
      workspaceSettings.setProjectSetting("previewAspectRatio", row.value);
    }
  };

  return (
    <DropdownRoot>
      <DropdownTrigger asChild>
        <Button
          variant="quiet"
          aria-label="Game aspect ratio"
          title="Game aspect ratio"
          class={`px-2.5 text-muted ${BAR_TEXT}`}
        >
          {aspectRatioLabel(choice, size)}
        </Button>
      </DropdownTrigger>
      <DropdownContent side="top" align="end" class="min-w-[210px]">
        <DropdownRadioGroup
          label="Game aspect ratio"
          value={choice}
          onValueChange={onValueChange}
        >
          {ASPECT_RATIO_ROWS.map(({ value, name, hint }) => (
            <DropdownRadioItem key={value} value={value} class="gap-2.5">
              <span class="w-[3.6em] tabular-nums group-data-[state=checked]:text-accent">
                {name}
              </span>
              <small class="text-[11px] font-normal text-muted">{hint}</small>
            </DropdownRadioItem>
          ))}
        </DropdownRadioGroup>
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
