import {
  Button,
  ChevronDownIcon,
  DropdownContent,
  DropdownRadioGroup,
  DropdownRadioItem,
  DropdownRoot,
  DropdownTrigger,
  ExpandIcon,
  SettingsIcon,
  ShrinkIcon,
} from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import workspace from "../../workspace/WorkspaceStore";
import { countProblems, problemsLabel } from "../../workspace/problemCounts";
import workspaceSettings from "../../workspace/settings/WorkspaceSettings";
import { settingsSectionHref } from "../settings";
import {
  ASPECT_RATIO_ROWS,
  aspectRatioLabel,
  barPosition,
  PAPER_SIZE_LABELS,
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
  const mode = workspaceSettings.preferences.value.previewMode;
  return (
    <div
      role="group"
      aria-label="Problems and display"
      class="flex h-11 shrink-0 items-center gap-1 px-2"
    >
      <ProblemsToggle />
      <PositionReadout />
      {mode === "screenplay" ? <PaperSizeLink /> : <AspectRatioMenu />}
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

function ProblemsToggle() {
  const counts = useComputed(() =>
    countProblems(workspace.state.value.debug?.diagnosticsSummary),
  ).value;

  const onClick = async () => {
    const { Workspace } = await import("../../workspace/Workspace");
    const uri = Workspace.window.getActiveEditorForPane("logic")?.uri;
    if (uri) {
      void Workspace.window.showProblems(uri);
    }
  };

  return (
    <Button
      variant="quiet"
      title="Open the problems"
      data-problems={counts.problems > 0 ? "" : undefined}
      class="gap-1.5 pr-2.5 pl-2 text-[12px]/[1.6] font-semibold text-muted data-problems:text-ink"
      onClick={onClick}
    >
      <ChevronDownIcon class="size-4! -rotate-90 text-muted" />
      <span>{problemsLabel(counts)}</span>
    </Button>
  );
}

function PositionReadout() {
  const position = useComputed(() => barPosition(workspace.state.value)).value;

  const onClick = async () => {
    if (!position) return;
    const { Workspace } = await import("../../workspace/Workspace");
    const uri =
      position.uri ?? Workspace.window.getActiveEditorForPane("logic")?.uri;
    if (!uri) return;
    const at = { line: position.line, character: 0 };
    void Workspace.window.revealDocument(uri, { start: at, end: at });
  };

  return (
    <div class="flex min-w-0 flex-1 justify-end">
      {position ? (
        <Button
          variant="quiet"
          title={position.title}
          class={`max-w-full min-w-0 justify-end px-2.5 text-muted ${BAR_TEXT}`}
          onClick={onClick}
        >
          <span class="truncate">{position.label}</span>
        </Button>
      ) : null}
    </div>
  );
}

function AspectRatioMenu() {
  const choice = workspaceSettings.projectSettings.value.previewAspectRatio;
  const size = useComputed(
    () => workspace.state.value.preview?.modes?.game?.size,
  ).value;

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
