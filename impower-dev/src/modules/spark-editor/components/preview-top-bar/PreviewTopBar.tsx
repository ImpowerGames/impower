import {
  BreakpointIcon,
  Button,
  CheckIcon,
  ChevronDownIcon,
  CogIcon,
  cn,
  DropdownCheckboxItem,
  DropdownContent,
  DropdownGroup,
  DropdownItem,
  DropdownLabel,
  DropdownRadioGroup,
  DropdownRadioItem,
  DropdownRoot,
  DropdownSeparator,
  DropdownTrigger,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PlayOutlineIcon,
  PreviousIcon,
  RestartIcon,
  ResumeIcon,
  ScreenplayIcon,
  SettingsIcon,
  StepIntoIcon,
  StepOutIcon,
  StepOverIcon,
  StopIcon,
  TextLinesIcon,
  useHoldRepeat,
  VisualIcon,
  type IconComponent,
} from "@impower/impower-ui/components";
import { useLayout } from "@impower/impower-ui/layout";
import { useSettings } from "../../workspace/settings/useSettings";
import { settingsSectionHref } from "../settings";
import {
  lockedPreviewSwitch,
  playsGame,
  PREVIEW_COLOR_SCHEMES,
  PREVIEW_MODES,
  type PreferenceKey,
  type PreviewColorScheme,
  type Preferences,
  type PreviewMode,
} from "../../workspace/settings/settingsSchema";
import workspace from "../../workspace/WorkspaceStore";
import { useCaretScript } from "../../workspace/useActiveEditor";
import type WorkspaceWindow from "../../workspace/WorkspaceWindow";
import { AspectRatioSettings } from "../preview-bar";
import { SavesMenuButton } from "../preview-saves";
import workspaceShortcuts from "../../workspace/shortcuts/WorkspaceShortcuts";
import { useRef } from "preact/hooks";
import { REPLAY_BEAT } from "@impower/spark-web-player/src/components/PlayerBar/replayBeat";
import {
  skipRefusal,
  STEP_REASONS,
  STEP_SHORTCUTS,
  stepRefusals,
  type SkipDirection,
  type StepTraversal,
} from "../../workspace/stepStates";
import { useStepSlotsFit } from "./useStepSlotsFit";

const STEP_MENU_SLOTS = 2;

const STEP_BUTTON_SLOTS = 4;

export const propDefaults = {};
export type PreviewTopBarProps = Partial<typeof propDefaults>;

type PreviewToggleKey = Extract<
  PreferenceKey,
  | "previewFollowsCursor"
  | "previewAutoPlayBeats"
  | "previewPlayAudio"
  | "previewIdleAnimations"
  | "previewTypingPauses"
  | "previewScreenplaySync"
  | "screenplayPaper"
  | "screenplayPaperTexture"
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
  textstream: {
    name: "Interactive Fiction",
    hint: "Play your game as a stream of text and choices",
    icon: TextLinesIcon,
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
  previewAutoPlayBeats: {
    name: "Auto-play beats",
    detail: "When the caret lands on a line, its beat plays once, as it would in the game.",
  },
  previewPlayAudio: {
    name: "Play audio",
    detail: "Beats played in the preview play their sound, as Play From Here would.",
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
  screenplayPaper: {
    name: "Screenplay paper matches my theme",
    detail: "The colors of your writing page.",
  },
  screenplayPaperTexture: {
    name: "Screenplay paper texture",
    detail: "Display a faint paper grain.",
  },
};

export const QUICK_TOGGLES: Record<PreviewMode, PreviewToggleKey[]> = {
  game: [
    "previewFollowsCursor",
    "previewAutoPlayBeats",
    "previewPlayAudio",
    "previewIdleAnimations",
    "previewTypingPauses",
  ],
  textstream: ["previewFollowsCursor", "previewAutoPlayBeats", "previewPlayAudio"],
  screenplay: [
    "previewScreenplaySync",
    "screenplayPaper",
    "screenplayPaperTexture",
  ],
};

export const PREVIEW_COLOR_SCHEME_NAMES: Record<PreviewColorScheme, string> = {
  editor: "Match editor",
  light: "Light",
  dark: "Dark",
};

export const PREVIEW_COLOR_SCHEME_DETAIL =
  "The light or dark setting the game sees on the reader's device. It changes only styles with a dark variant, and a game that sets ui.color_scheme to light or dark ignores it.";

const STEPS: readonly {
  traversal: StepTraversal;
  label: string;
  icon: IconComponent;
}[] = [
  { traversal: "over", label: "Step Over", icon: StepOverIcon },
  { traversal: "in", label: "Step Into", icon: StepIntoIcon },
  { traversal: "out", label: "Step Out", icon: StepOutIcon },
];

const isToggleOn = (preferences: Preferences, key: PreviewToggleKey) =>
  key === "screenplayPaper"
    ? preferences.screenplayPaper === "theme"
    : preferences[key];

const withWindow = async (act: (window: WorkspaceWindow) => unknown) => {
  const { Workspace } = await import("../../workspace/Workspace");
  act(Workspace.window);
};

const controlClass = "text-muted";

const MENU_WIDTH = "w-[340px] max-w-[calc(100cqi-24px)]";

function ControlButton({
  label,
  icon: Icon,
  disabled,
  reason,
  title,
  pressed,
  onClick,
}: {
  label: string;
  icon: IconComponent;
  disabled?: boolean;
  reason?: string;
  title?: string;
  pressed?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="quiet"
      size="icon"
      aria-label={label}
      title={reason ?? title ?? label}
      aria-pressed={pressed}
      aria-disabled={reason ? true : undefined}
      disabled={disabled}
      onClick={reason ? undefined : onClick}
      class={`${pressed ? "text-accent" : controlClass} aria-disabled:cursor-default aria-disabled:opacity-40`}
    >
      <Icon />
    </Button>
  );
}

const step = (traversal: StepTraversal) =>
  void withWindow((window) => window.stepGame(traversal));

const TOGGLE_BREAKPOINT = "Toggle breakpoint";

const NO_CARET_REASON =
  "Put the caret on a script line to toggle its breakpoint.";

const toggleBreakpoint = (filename: string) =>
  void withWindow((window) => window.toggleBreakpointAtCaret(filename));

type StepEntriesProps = {
  refusals: Record<StepTraversal, string | undefined>;
  caretScript: string | undefined;
};

export const STEP_GROUP = "Step";

function StepEntries({ refusals, caretScript }: StepEntriesProps) {
  return (
    <>
      {STEPS.map(({ traversal, label, icon: Icon }) => {
        const reason = refusals[traversal];
        return (
          <DropdownItem
            key={traversal}
            disabled={!!reason}
            onSelect={() => step(traversal)}
            inset="narrow"
            class="min-h-14 gap-3 py-2"
          >
            <Icon class="shrink-0" />
            <span class="flex min-w-0 flex-1 flex-col whitespace-normal">
              <strong class="text-sm/[1.4] font-semibold">{label}</strong>
              {reason ? (
                <small class="text-xs/[1.5] text-muted">{reason}</small>
              ) : null}
            </span>
          </DropdownItem>
        );
      })}
      <DropdownSeparator />
      <DropdownItem
        disabled={!caretScript}
        onSelect={() => caretScript && toggleBreakpoint(caretScript)}
        inset="narrow"
        class="min-h-14 gap-3 py-2"
      >
        <BreakpointIcon class="shrink-0" />
        <span class="flex min-w-0 flex-1 flex-col whitespace-normal">
          <strong class="text-sm/[1.4] font-semibold">
            {TOGGLE_BREAKPOINT}
          </strong>
          {caretScript ? null : (
            <small class="text-xs/[1.5] text-muted">{NO_CARET_REASON}</small>
          )}
        </span>
      </DropdownItem>
    </>
  );
}

function StepMenu(props: StepEntriesProps) {
  return (
    <DropdownRoot>
      <DropdownTrigger asChild>
        <Button
          variant="quiet"
          size="icon"
          aria-label={STEP_GROUP}
          title={STEP_GROUP}
          class="text-muted aria-expanded:bg-tint aria-expanded:text-accent"
        >
          <StepOverIcon />
        </Button>
      </DropdownTrigger>
      <DropdownContent align="center">
        <StepEntries {...props} />
      </DropdownContent>
    </DropdownRoot>
  );
}

function SkipButton({
  direction,
  reason,
}: {
  direction: SkipDirection;
  reason?: string;
}) {
  const byChoice = useRef(false);
  const hold = useHoldRepeat(() => {
    const to = byChoice.current ? "choice" : "beat";
    void withWindow((window) => window.skipBeat(direction, to));
  });
  const label = direction < 0 ? "Skip back" : "Skip forward";
  const Icon = direction < 0 ? PreviousIcon : NextIcon;
  return (
    <Button
      variant="quiet"
      size="icon"
      aria-label={label}
      title={reason ?? label}
      aria-disabled={reason ? true : undefined}
      data-pressed={hold.pressed && !reason ? "" : undefined}
      onPointerDown={(e: PointerEvent) => {
        byChoice.current = e.shiftKey;
        hold.onPointerDown(e);
      }}
      onPointerUp={hold.onPointerUp}
      onPointerCancel={hold.onPointerCancel}
      onPointerLeave={hold.onPointerLeave}
      onClick={(e: MouseEvent) => {
        byChoice.current = e.shiftKey;
        hold.onClick(e);
      }}
      class="text-muted data-[pressed]:bg-tint data-[pressed]:text-accent aria-disabled:cursor-default aria-disabled:opacity-40"
    >
      <Icon />
    </Button>
  );
}

function ModeMenu({ mode }: { mode: PreviewMode }) {
  const current = VIEWING_MODES[mode];
  const Icon = current.icon;
  return (
    <DropdownRoot>
      <DropdownTrigger asChild>
        <Button
          variant="quiet"
          aria-label={`Viewing mode: ${current.name}`}
          title={`Viewing mode: ${current.name}`}
          class="max-w-full shrink-0 border-0 @max-[640px]:max-w-none gap-1.5 pr-1.5 pl-2.5 text-xs text-muted aria-expanded:bg-tint aria-expanded:text-accent @max-[480px]:w-11 @max-[480px]:justify-start @max-[480px]:pr-0 @max-[480px]:pl-0.5 @max-[360px]:hidden [&_svg]:size-5"
        >
          <Icon />
          <span class="truncate @max-[640px]:hidden">
            {current.name}
          </span>
          <ChevronDownIcon class="!size-3.5" />
        </Button>
      </DropdownTrigger>
      <DropdownContent
        align="start"
        class={MENU_WIDTH}
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

function ColorSchemeSettings() {
  const { projectSettings, setProjectSetting } = useSettings();
  return (
    <>
      <DropdownSeparator />
      <DropdownLabel variant="heading" inset="narrow">Device color scheme</DropdownLabel>
      <DropdownLabel inset="narrow" class="pt-0 text-xs/[1.5] text-muted">
        {PREVIEW_COLOR_SCHEME_DETAIL}
      </DropdownLabel>
      <DropdownRadioGroup
        label="Device color scheme"
        value={projectSettings.previewColorScheme}
        onValueChange={(value: string) => {
          const choice = PREVIEW_COLOR_SCHEMES.find((c) => c === value);
          if (choice) {
            setProjectSetting("previewColorScheme", choice);
          }
        }}
      >
        {PREVIEW_COLOR_SCHEMES.map((id) => (
          <DropdownRadioItem key={id} value={id} inset="narrow" class={RADIO_ROW_LIKE_CHECKBOX_ROW}>
            <span class="group-data-[state=checked]:text-accent">
              {PREVIEW_COLOR_SCHEME_NAMES[id]}
            </span>
          </DropdownRadioItem>
        ))}
      </DropdownRadioGroup>
    </>
  );
}

export const MORE_PREVIEW_SETTINGS = "More preview settings";

const RADIO_ROW_LIKE_CHECKBOX_ROW = "gap-3 [&>[data-radio-indicator]]:size-[18px]";

const SETTINGS_MENU_ROWS =
  "flex flex-col gap-0.5 [&_[role=group]]:flex [&_[role=group]]:flex-col [&_[role=group]]:gap-0.5 [&_[role=separator]]:my-1 [&_[role=separator]]:shrink-0";

function SettingsMenu({
  mode,
  steps,
}: {
  mode: PreviewMode;
  steps?: StepEntriesProps;
}) {
  const phone = useLayout() === "phone";
  const { preferences, reducedMotion, setPreference } = useSettings();
  return (
    <DropdownRoot>
      <DropdownTrigger asChild>
        <Button
          variant="quiet"
          size="icon"
          aria-label="Preview settings"
          title="Preview settings"
          class="text-muted"
        >
          <CogIcon />
        </Button>
      </DropdownTrigger>
      <DropdownContent
        align="end"
        sideOffset={4}
        edgeGap={0}
        elevation="toolbar"
        opensAt="top"
        class={cn(MENU_WIDTH, SETTINGS_MENU_ROWS)}
      >
        {steps ? (
          <>
            <DropdownGroup heading={STEP_GROUP} inset="narrow">
              <StepEntries {...steps} />
            </DropdownGroup>
            <DropdownSeparator />
          </>
        ) : null}
        {QUICK_TOGGLES[mode].map((key) => {
          const { name, detail } = PREVIEW_TOGGLES[key];
          const locked = lockedPreviewSwitch(preferences, reducedMotion, key);
          const checked = locked ?? isToggleOn(preferences, key);
          return (
            <DropdownCheckboxItem
              key={key}
              checked={checked}
              disabled={locked != null}
              onCheckedChange={(next) =>
                key === "screenplayPaper"
                  ? setPreference(key, next ? "theme" : "paper")
                  : setPreference(key, next)
              }
              onSelect={(e) => e.preventDefault()}
              inset="narrow"
              class="group min-h-14 items-center gap-3 py-2"
            >
              <CheckIcon class="text-accent invisible group-aria-checked:visible" />
              <span class="flex min-w-0 flex-1 flex-col whitespace-normal">
                <strong class="text-sm/[1.4] font-semibold group-aria-checked:text-accent">
                  {name}
                </strong>
                <small class="text-[11px]/[1.5] text-muted group-aria-checked:font-semibold">
                  {detail}
                </small>
              </span>
            </DropdownCheckboxItem>
          );
        })}
        {playsGame(mode) ? <ColorSchemeSettings /> : null}
        {phone ? <AspectRatioSettings mode={mode} inset="narrow" itemClass={RADIO_ROW_LIKE_CHECKBOX_ROW} /> : null}
        <DropdownItem
          onSelect={() => {
            if (document.fullscreenElement) {
              void document.exitFullscreen();
            }
            window.location.assign(settingsSectionHref("preview-preferences"));
          }}
          inset="narrow"
          class="mt-1 min-h-14 gap-3 rounded-t-none border-t border-solid border-edge py-2"
        >
          <SettingsIcon class="text-accent" />
          <strong class="text-sm/[1.4] font-semibold">{MORE_PREVIEW_SETTINGS}</strong>
        </DropdownItem>
      </DropdownContent>
    </DropdownRoot>
  );
}

export default function PreviewTopBar(_props: PreviewTopBarProps) {
  const { preferences } = useSettings();
  const phone = useLayout() === "phone";
  const mode = preferences.previewMode;
  const game = workspace.state.value.preview?.modes?.game;
  const running = !!game?.running;
  const live = running || !!game?.starting;
  const ended = running && !!game?.ended;
  const playing = running && !ended;
  const paused = playing && !!game?.paused;
  const loading = !!game?.loading;
  const refusal = live ? undefined : game?.playRefusal;
  const pressRefusal = live ? undefined : (refusal ?? game?.startRefusal);
  const session = workspace.debugSession.value;
  const refusals = stepRefusals(game, session);
  const caretScript = useCaretScript();
  const bar = useRef<HTMLDivElement>(null);
  const fits = useStepSlotsFit(bar, running);
  const stepsInBar = running && fits;
  const folded = running && !fits;
  const stepButton = (traversal: StepTraversal) => {
    const { label, icon } = STEPS.find((s) => s.traversal === traversal)!;
    return (
      <ControlButton
        label={label}
        icon={icon}
        reason={refusals[traversal]}
        title={workspaceShortcuts.title(STEP_SHORTCUTS[traversal], label)}
        onClick={() => step(traversal)}
      />
    );
  };

  return (
    <div
      ref={bar}
      role="group"
      aria-label="Playback controls"
      data-running={running ? "" : undefined}
      data-steps-folded={folded ? "" : undefined}
      class="relative z-[1] grid h-[var(--preview-top-bar-height)] shrink-0 grid-cols-[minmax(44px,1fr)_auto_minmax(44px,1fr)] items-center gap-2 px-2.5 @max-[360px]:gap-0 @max-[360px]:px-1"
    >
      <div class="flex min-w-0 max-w-full items-center gap-1 justify-self-start @max-[480px]:gap-0">
        <ModeMenu mode={mode} />
        {playing ? (
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
        {ended ? (
          <ControlButton
            label="Play Again"
            icon={RestartIcon}
            disabled={loading}
            onClick={() => void withWindow((window) => window.replayGame())}
          />
        ) : null}
        {running || !playsGame(mode) ? null : (
          <ControlButton
            label={REPLAY_BEAT}
            icon={PlayOutlineIcon}
            reason={
              live
                ? STEP_REASONS.starting
                : (refusal ?? game?.beatRefusal ?? undefined)
            }
            title={workspaceShortcuts.title("replayBeat", REPLAY_BEAT)}
            pressed={!!game?.beatPlaying}
            disabled={loading}
            onClick={() => void withWindow((window) => window.playBeat())}
          />
        )}
      </div>
      <div class="flex items-center justify-center gap-1 @max-[360px]:gap-0">
        <span
          class={cn("contents", !phone && "@min-[740px]:hidden")}
          data-step-slots={STEP_MENU_SLOTS}
        >
          {stepsInBar ? (
            <StepMenu refusals={refusals} caretScript={caretScript} />
          ) : null}
        </span>
        {phone ? null : (
          <span
            class="contents @max-[740px]:hidden"
            data-step-slots={STEP_BUTTON_SLOTS}
          >
            {stepsInBar ? (
              <>
                {stepButton("over")}
                {stepButton("in")}
              </>
            ) : null}
          </span>
        )}
        <SkipButton direction={-1} reason={skipRefusal(game, session, -1)} />
        <Button
          variant="primary"
          size="icon"
          aria-label={live ? "Stop" : "Play From Here"}
          title={pressRefusal ?? (live ? "Stop" : "Play From Here")}
          aria-disabled={pressRefusal || loading ? true : undefined}
          onClick={
            pressRefusal || loading
              ? undefined
              : () => void withWindow((window) => window.toggleGameRunning())
          }
          raised
          class="rounded-full border-0 aria-disabled:cursor-default aria-disabled:opacity-40 [&_svg]:size-6"
        >
          {live ? <StopIcon /> : <PlayIcon />}
        </Button>
        <SkipButton direction={1} reason={skipRefusal(game, session, 1)} />
        {stepsInBar ? (
          <span
            aria-hidden="true"
            data-step-balance
            class={cn("w-11 shrink-0", !phone && "@min-[740px]:hidden")}
          />
        ) : null}
        {stepsInBar && !phone ? (
          <span class="contents @max-[740px]:hidden">
            {stepButton("out")}
            <ControlButton
              label={TOGGLE_BREAKPOINT}
              icon={BreakpointIcon}
              reason={caretScript ? undefined : NO_CARET_REASON}
              onClick={() => toggleBreakpoint(caretScript!)}
            />
          </span>
        ) : null}
      </div>
      <div class="flex items-center gap-1 justify-self-end @max-[360px]:gap-0">
        {playsGame(mode) ? <SavesMenuButton /> : null}
        <SettingsMenu
          mode={mode}
          steps={folded ? { refusals, caretScript } : undefined}
        />
      </div>
    </div>
  );
}
