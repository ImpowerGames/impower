import {
  BreakpointIcon,
  Button,
  CheckIcon,
  ChevronDownIcon,
  CogIcon,
  DropdownCheckboxItem,
  DropdownContent,
  DropdownItem,
  DropdownRadioGroup,
  DropdownRadioItem,
  DropdownRoot,
  DropdownSeparator,
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
  StepOverIcon,
  StopIcon,
  TextLinesIcon,
  useHoldRepeat,
  VisualIcon,
  type IconComponent,
} from "@impower/impower-ui/components";
import { useLayout } from "@impower/impower-ui/layout";
import { useSettings } from "../../workspace/settings/useSettings";
import {
  PREVIEW_MODES,
  type PreferenceKey,
  type Preferences,
  type PreviewMode,
} from "../../workspace/settings/settingsSchema";
import workspace from "../../workspace/WorkspaceStore";
import { useCaretScript } from "../../workspace/useActiveEditor";
import type WorkspaceWindow from "../../workspace/WorkspaceWindow";
import workspaceShortcuts from "../../workspace/shortcuts/WorkspaceShortcuts";
import { useRef } from "preact/hooks";
import {
  skipRefusal,
  STEP_SHORTCUTS,
  stepRefusals,
  type SkipDirection,
  type StepTraversal,
} from "../../workspace/stepStates";

export const propDefaults = {};
export type PreviewTopBarProps = Partial<typeof propDefaults>;

type PreviewToggleKey = Extract<
  PreferenceKey,
  | "previewFollowsCursor"
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
  game: ["previewFollowsCursor", "previewIdleAnimations", "previewTypingPauses"],
  textstream: ["previewFollowsCursor"],
  screenplay: [
    "previewScreenplaySync",
    "screenplayPaper",
    "screenplayPaperTexture",
  ],
};

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

const useMenuWidth = () =>
  useLayout() === "phone" ? undefined : "w-[340px] max-w-[calc(100cqi-20px)]";

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

function StepMenu({
  refusals,
  caretScript,
}: {
  refusals: Record<StepTraversal, string | undefined>;
  caretScript: string | undefined;
}) {
  return (
    <DropdownRoot>
      <DropdownTrigger asChild>
        <Button
          variant="quiet"
          size="icon"
          aria-label="Step"
          title="Step"
          class="text-muted aria-expanded:bg-tint aria-expanded:text-accent"
        >
          <StepOverIcon />
        </Button>
      </DropdownTrigger>
      <DropdownContent align="center">
        {STEPS.map(({ traversal, label, icon: Icon }) => {
          const reason = refusals[traversal];
          return (
            <DropdownItem
              key={traversal}
              disabled={!!reason}
              onSelect={() => step(traversal)}
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
          class="max-w-full gap-1.5 pr-1.5 pl-2.5 text-xs text-muted aria-expanded:bg-tint aria-expanded:text-accent group-data-[running]/bar:@max-[480px]:w-11 group-data-[running]/bar:@max-[480px]:px-0 group-data-[running]/bar:@max-[360px]:hidden [&_svg]:size-5"
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
          const checked = isToggleOn(preferences, key);
          return (
            <DropdownCheckboxItem
              key={key}
              checked={checked}
              onCheckedChange={(next) =>
                key === "screenplayPaper"
                  ? setPreference(key, next ? "theme" : "paper")
                  : setPreference(key, next)
              }
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
  const phone = useLayout() === "phone";
  const mode = preferences.previewMode;
  const game = workspace.state.value.preview?.modes?.game;
  const running = !!game?.running;
  const ended = running && !!game?.ended;
  const playing = running && !ended;
  const paused = playing && !!game?.paused;
  const loading = !!game?.loading;
  const refusal = running ? undefined : game?.playRefusal;
  const session = workspace.debugSession.value;
  const refusals = stepRefusals(game, session);
  const caretScript = useCaretScript();
  const steps = running;
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
      role="group"
      aria-label="Playback controls"
      data-running={running ? "" : undefined}
      class="group/bar relative z-[1] grid h-[52px] shrink-0 grid-cols-[minmax(44px,1fr)_auto_minmax(44px,1fr)] items-center gap-2 px-2.5 @max-[340px]:gap-1 data-[running]:@max-[480px]:grid-cols-[auto_1fr_auto] data-[running]:@max-[480px]:gap-0 data-[running]:@max-[480px]:px-1"
    >
      <div class="flex min-w-0 max-w-full items-center gap-1 justify-self-start group-data-[running]/bar:@max-[480px]:gap-0">
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
      </div>
      <div class="flex items-center justify-center gap-1 @max-[340px]:gap-0 group-data-[running]/bar:@max-[480px]:gap-0">
        {steps && phone ? (
          <StepMenu refusals={refusals} caretScript={caretScript} />
        ) : null}
        {steps && !phone ? stepButton("over") : null}
        {steps && !phone ? stepButton("in") : null}
        <SkipButton direction={-1} reason={skipRefusal(game, session, -1)} />
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
        <SkipButton direction={1} reason={skipRefusal(game, session, 1)} />
        {steps && !phone ? stepButton("out") : null}
        {steps && !phone ? (
          <ControlButton
            label={TOGGLE_BREAKPOINT}
            icon={BreakpointIcon}
            reason={caretScript ? undefined : NO_CARET_REASON}
            onClick={() => toggleBreakpoint(caretScript!)}
          />
        ) : null}
      </div>
      <div class="justify-self-end">
        <SettingsMenu mode={mode} />
      </div>
    </div>
  );
}
