import {
  Button,
  CheckIcon,
  ChevronDownIcon,
  CogIcon,
  DropdownCheckboxItem,
  DropdownContent,
  DropdownRadioGroup,
  DropdownRadioItem,
  DropdownRoot,
  DropdownTrigger,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PreviousIcon,
  RestartIcon,
  ResumeIcon,
  ScreenplayIcon,
  StepIntoIcon,
  StepOutIcon,
  StopIcon,
  useHoldRepeat,
  VisualIcon,
  type IconComponent,
} from "@impower/impower-ui/components";
import { useLayout } from "@impower/impower-ui/layout";
import { useSettings } from "../../workspace/settings/useSettings";
import {
  PREVIEW_MODES,
  type PreferenceKey,
  type PreviewMode,
} from "../../workspace/settings/settingsSchema";
import workspace from "../../workspace/WorkspaceStore";
import type WorkspaceWindow from "../../workspace/WorkspaceWindow";

export const propDefaults = {};
export type PreviewTopBarProps = Partial<typeof propDefaults>;

type PreviewToggleKey = Extract<
  PreferenceKey,
  | "previewFollowsCursor"
  | "previewIdleAnimations"
  | "previewTypingPauses"
  | "previewScreenplaySync"
>;

export const VIEWING_MODES: Record<
  PreviewMode,
  { name: string; hint: string; icon: IconComponent }
> = {
  game: {
    name: "Visual Novel",
    hint: "Play your game as a series of dialogue boxes and choice menus",
    icon: VisualIcon,
  },
  screenplay: {
    name: "Screenplay",
    hint: "Read your story as text on a printed page",
    icon: ScreenplayIcon,
  },
};

export const PREVIEW_TOGGLES: Record<
  PreviewToggleKey,
  { name: string; detail: string }
> = {
  previewFollowsCursor: {
    name: "Game preview follows cursor",
    detail: "The game shows the line the caret is on.",
  },
  previewIdleAnimations: {
    name: "Show idle animations",
    detail:
      "Portraits, ui, and text with idle motion keep moving in the preview. Otherwise, they are shown in their resting state.",
  },
  previewTypingPauses: {
    name: "Color typing pauses",
    detail:
      "Mark the pauses and beeps of the typewriter while the game plays, to tune its timing.",
  },
  previewScreenplaySync: {
    name: "Sync screenplay and editor scroll position",
    detail:
      "The screenplay preview scrolls to show the same line visible in the script editor.",
  },
};

export const QUICK_TOGGLES: Record<PreviewMode, PreviewToggleKey[]> = {
  game: ["previewFollowsCursor", "previewIdleAnimations", "previewTypingPauses"],
  screenplay: ["previewScreenplaySync"],
};

const withWindow = async (act: (window: WorkspaceWindow) => unknown) => {
  const { Workspace } = await import("../../workspace/Workspace");
  act(Workspace.window);
};

const controlClass = "text-muted";

const useMenuWidth = () =>
  useLayout() === "phone" ? undefined : "w-[340px] max-w-[calc(100cqi-20px)]";

function ControlButton({
  label,
  icon: Icon,
  disabled,
  pressed,
  onClick,
}: {
  label: string;
  icon: IconComponent;
  disabled?: boolean;
  pressed?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="quiet"
      size="icon"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      class={pressed ? "text-accent" : controlClass}
    >
      <Icon />
    </Button>
  );
}

function SkipButton({ direction }: { direction: -1 | 1 }) {
  const hold = useHoldRepeat(() => {
    void withWindow((window) => window.skipBeat(direction));
  });
  const label = direction < 0 ? "Skip back" : "Skip forward";
  const Icon = direction < 0 ? PreviousIcon : NextIcon;
  return (
    <Button
      variant="quiet"
      size="icon"
      aria-label={label}
      title={label}
      data-pressed={hold.pressed ? "" : undefined}
      onPointerDown={hold.onPointerDown}
      onPointerUp={hold.onPointerUp}
      onPointerCancel={hold.onPointerCancel}
      onPointerLeave={hold.onPointerLeave}
      onClick={hold.onClick}
      class="text-muted data-[pressed]:bg-tint data-[pressed]:text-accent"
    >
      <Icon />
    </Button>
  );
}

function ModeMenu({ mode }: { mode: PreviewMode }) {
  const menuWidth = useMenuWidth();
  const current = VIEWING_MODES[mode];
  const Icon = current.icon;
  return (
    <DropdownRoot>
      <DropdownTrigger asChild>
        <Button
          variant="quiet"
          aria-label="Viewing mode"
          title="Viewing mode"
          class="max-w-full min-w-0 gap-1.5 pr-1.5 pl-2.5 text-xs text-muted aria-expanded:bg-tint aria-expanded:text-accent group-data-[running]/bar:@max-[480px]:w-11 group-data-[running]/bar:@max-[480px]:px-0 [&_svg]:size-5"
        >
          <Icon />
          <span class="truncate @max-[470px]:hidden group-data-[running]/bar:@max-[640px]:hidden">
            {current.name}
          </span>
          <ChevronDownIcon class="!size-3.5 group-data-[running]/bar:@max-[480px]:hidden" />
        </Button>
      </DropdownTrigger>
      <DropdownContent
        align="start"
        class={menuWidth}
      >
        <DropdownRadioGroup
          value={mode}
          label="Viewing mode"
          onValueChange={(value: string) =>
            void withWindow((window) =>
              window.setPreviewMode(value as PreviewMode),
            )
          }
        >
          {PREVIEW_MODES.map((id) => {
            const { name, hint, icon: ModeIcon } = VIEWING_MODES[id];
            return (
              <DropdownRadioItem
                key={id}
                value={id}
                indicator="end"
                class="min-h-16 gap-3 py-2"
              >
                <ModeIcon class="!size-[22px] shrink-0" />
                <span class="flex min-w-0 flex-1 flex-col whitespace-normal">
                  <strong class="text-sm/[1.4] font-semibold group-data-[state=checked]:text-accent">
                    {name}
                  </strong>
                  <small class="text-xs/[1.5] font-normal text-muted">
                    {hint}
                  </small>
                </span>
              </DropdownRadioItem>
            );
          })}
        </DropdownRadioGroup>
      </DropdownContent>
    </DropdownRoot>
  );
}

function SettingsMenu({ mode }: { mode: PreviewMode }) {
  const menuWidth = useMenuWidth();
  const { preferences, setPreference } = useSettings();
  return (
    <DropdownRoot>
      <DropdownTrigger asChild>
        <Button
          variant="quiet"
          size="icon"
          aria-label="Preview settings"
          title="Preview settings"
          class="text-muted aria-expanded:bg-tint aria-expanded:text-accent"
        >
          <CogIcon />
        </Button>
      </DropdownTrigger>
      <DropdownContent
        align="end"
        class={menuWidth}
      >
        {QUICK_TOGGLES[mode].map((key) => {
          const { name, detail } = PREVIEW_TOGGLES[key];
          const checked = preferences[key];
          return (
            <DropdownCheckboxItem
              key={key}
              checked={checked}
              onCheckedChange={(next) => setPreference(key, next)}
              onSelect={(e) => e.preventDefault()}
              class="group min-h-14 items-center gap-3 py-2"
            >
              <CheckIcon class="text-accent invisible group-aria-checked:visible" />
              <span class="flex min-w-0 flex-1 flex-col whitespace-normal">
                <strong class="text-sm/[1.4] font-semibold group-aria-checked:text-accent">
                  {name}
                </strong>
                <small class="text-xs/[1.5] text-muted">{detail}</small>
              </span>
            </DropdownCheckboxItem>
          );
        })}
      </DropdownContent>
    </DropdownRoot>
  );
}

export default function PreviewTopBar(_props: PreviewTopBarProps) {
  const { preferences } = useSettings();
  const mode = preferences.previewMode;
  const game = workspace.state.value.preview?.modes?.game;
  const running = !!game?.running;
  const ended = running && !!game?.ended;
  const playing = running && !ended;
  const paused = playing && !!game?.paused;
  const loading = !!game?.loading;
  const refusal = running ? undefined : game?.playRefusal;
  const playable = mode === "game";

  return (
    <div
      role="group"
      aria-label="Playback controls"
      data-running={playable && running ? "" : undefined}
      class="group/bar relative z-[1] grid h-[52px] shrink-0 grid-cols-[minmax(44px,1fr)_auto_minmax(44px,1fr)] items-center gap-2 px-2.5 @max-[340px]:gap-1 data-[running]:@max-[480px]:grid-cols-[auto_1fr_auto] data-[running]:@max-[480px]:gap-0 data-[running]:@max-[480px]:px-1"
    >
      <div class="flex min-w-0 max-w-full items-center gap-1 justify-self-start group-data-[running]/bar:@max-[480px]:gap-0">
        <ModeMenu mode={mode} />
        {playable && playing ? (
          <ControlButton
            label={paused ? "Resume" : "Pause"}
            icon={paused ? ResumeIcon : PauseIcon}
            pressed={paused}
            onClick={() =>
              void withWindow((window) =>
                paused ? window.unpauseGame() : window.pauseGame(),
              )
            }
          />
        ) : null}
        {playable && ended ? (
          <ControlButton
            label="Play Again"
            icon={RestartIcon}
            disabled={loading}
            onClick={() => void withWindow((window) => window.replayGame())}
          />
        ) : null}
      </div>
      <div class="flex items-center justify-center gap-1 @max-[340px]:gap-0 group-data-[running]/bar:@max-[480px]:gap-0">
        {playable && playing ? (
          <ControlButton
            label="Step Into"
            icon={StepIntoIcon}
            disabled={!paused}
            onClick={() => void withWindow((window) => window.stepGame("in"))}
          />
        ) : null}
        <SkipButton direction={-1} />
        {playable ? (
          <Button
            variant="primary"
            size="icon"
            aria-label={running ? "Stop" : "Play From Here"}
            title={refusal ?? (running ? "Stop" : "Play From Here")}
            aria-disabled={refusal || loading ? true : undefined}
            onClick={
              refusal || loading
                ? undefined
                : () => void withWindow((window) => window.toggleGameRunning())
            }
            class="rounded-full border-0 aria-disabled:cursor-default aria-disabled:opacity-40 [&_svg]:size-6"
          >
            {running ? <StopIcon /> : <PlayIcon />}
          </Button>
        ) : null}
        <SkipButton direction={1} />
        {playable && playing ? (
          <ControlButton
            label="Step Out"
            icon={StepOutIcon}
            disabled={!paused}
            onClick={() => void withWindow((window) => window.stepGame("out"))}
          />
        ) : null}
      </div>
      <div class="justify-self-end">
        <SettingsMenu mode={mode} />
      </div>
    </div>
  );
}
