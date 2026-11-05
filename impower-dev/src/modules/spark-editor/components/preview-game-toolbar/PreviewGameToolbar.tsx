import {
  BugIcon,
  Button,
  CheckIcon,
  CogIcon,
  DropdownCheckboxItem,
  DropdownContent,
  DropdownRoot,
  DropdownTrigger,
  FastForwardIcon,
  FollowIcon,
  FollowOffIcon,
  NextIcon,
  PauseFillIcon,
  PlayIcon,
  PreviousIcon,
  RestartIcon,
  ResumeIcon,
  RewindIcon,
  ScreenplayIcon,
  StopIcon,
} from "@impower/impower-ui/components";
import type {
  IconComponent,
} from "@impower/impower-ui/components";
import { useEffect, useRef } from "preact/hooks";
import throttle from "../../utils/throttle";
import workspace from "../../workspace/WorkspaceStore";

export const propDefaults = {};
export type PreviewGameToolbarProps = Partial<typeof propDefaults>;

export default function PreviewGameToolbar(_props: PreviewGameToolbarProps) {
  const game = workspace.state.value.preview?.modes?.game;
  const running = !!game?.running;
  const ended = running && !!game?.ended;
  const paused = !!game?.paused;
  const debugging = !!game?.debugging;
  const loading = !!game?.loading;
  const playRefusal = running ? undefined : game?.playRefusal;
  const animatePortraits = workspace.animatePortraits.value;

  const controllingPlayback = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (controllingPlayback.current) {
        window.cancelAnimationFrame(controllingPlayback.current);
      }
    };
  }, []);

  const stopPlayback = () => {
    if (controllingPlayback.current) {
      window.cancelAnimationFrame(controllingPlayback.current);
      controllingPlayback.current = 0;
    }
  };

  const startPlayback = async (seconds: number) => {
    const { Workspace } = await import("../../workspace/Workspace");
    if (seconds < 0 && !paused) Workspace.window.pauseGame();
    const step = throttle(() => Workspace.window.stepGameClock(seconds), 100);
    stopPlayback();
    const loop = () => {
      step();
      controllingPlayback.current = window.requestAnimationFrame(loop);
    };
    controllingPlayback.current = window.requestAnimationFrame(loop);
  };

  const onRunToggle = async () => {
    const { Workspace } = await import("../../workspace/Workspace");
    Workspace.window.toggleGameRunning();
  };

  const onPlayAgain = async () => {
    const { Workspace } = await import("../../workspace/Workspace");
    Workspace.window.replayGame();
  };

  const onModeToggle = async () => {
    const { Workspace } = await import("../../workspace/Workspace");
    Workspace.window.setPreviewMode("screenplay");
  };

  const onPauseToggle = async () => {
    const { Workspace } = await import("../../workspace/Workspace");
    Workspace.window.toggleGamePaused();
  };

  const onAnimatePortraitsToggle = async () => {
    const { Workspace } = await import("../../workspace/Workspace");
    Workspace.window.toggleAnimatePortraits();
  };

  const onDebugChange =async (next: boolean) => {
    const { Workspace } = await import("../../workspace/Workspace");
    if (next) Workspace.window.enableDebugging();
    else Workspace.window.disableDebugging();
  };

  return (
    <div class="sticky top-0 z-[1] flex h-12 flex-row items-center bg-panel">

      <RunToggle
        loading={loading}
        running={running}
        refusal={playRefusal}
        onClick={loading || playRefusal ? undefined : onRunToggle}
      />

      <span class="flex-1" />


      {ended ? (
        <Button
          variant="quiet"
          aria-label="Play Again"
          onClick={loading ? undefined : onPlayAgain}
        >
          <RestartIcon />
          Play Again
        </Button>
      ) : running ? (
        <div class="flex flex-row items-center">
          <PointerHoldButton
            ariaLabel="Step Backward"
            icon={PreviousIcon}
            onStart={() => startPlayback(-0.01)}
            onStop={stopPlayback}
          />
          <PointerHoldButton
            ariaLabel="Fast Backward"
            icon={RewindIcon}
            onStart={() => startPlayback(-0.1)}
            onStop={stopPlayback}
          />
          <IconButton
            ariaLabel={paused ? "Play" : "Pause"}
            icon={paused ? ResumeIcon : PauseFillIcon}
            onClick={onPauseToggle}
          />
          <PointerHoldButton
            ariaLabel="Fast Forward"
            icon={FastForwardIcon}
            onStart={() => startPlayback(0.1)}
            onStop={stopPlayback}
          />
          <PointerHoldButton
            ariaLabel="Step Forward"
            icon={NextIcon}
            onStart={() => startPlayback(0.01)}
            onStop={stopPlayback}
          />
        </div>
      ) : (
        <div
          inert
          class="flex flex-row items-center justify-center text-base text-foreground select-none"
        >
          Game Preview
        </div>
      )}

      <span class="flex-1" />


      <Button
        variant="quiet"
        size="icon"
        aria-label="Animate portraits"
        aria-pressed={animatePortraits}
        title="Animate portraits"
        onClick={onAnimatePortraitsToggle}
        class={animatePortraits ? "text-ink" : "text-muted"}
      >
        {animatePortraits ? (
          <FollowIcon />
        ) : (
          <FollowOffIcon />
        )}
      </Button>
      {running ? (
        <DropdownRoot>
          <DropdownTrigger asChild>
            <Button
              variant="quiet"
              size="icon"
              aria-label="Settings"
              class="text-muted"
            >
              <CogIcon />
            </Button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownCheckboxItem
              checked={debugging}
              onCheckedChange={onDebugChange}
            >
              {debugging ? (
                <CheckIcon class="size-4" />
              ) : (
                <BugIcon class="size-4" />
              )}
              <span>Debugging</span>
            </DropdownCheckboxItem>
          </DropdownContent>
        </DropdownRoot>
      ) : (
        <IconButton
          ariaLabel="Preview Screenplay"
          icon={ScreenplayIcon}
          dimmed
          onClick={onModeToggle}
        />
      )}
    </div>
  );
}

function RunToggle({
  loading,
  running,
  refusal,
  onClick,
}: {
  loading: boolean;
  running: boolean;
  refusal?: string;
  onClick?: () => void;
}) {
  if (loading) {
    return (
      <div class="flex h-11 w-12 flex-col items-center justify-center text-primary/70">
        <Spinner />
      </div>
    );
  }
  const Icon = running ? StopIcon : PlayIcon;
  const label = running ? "STOP" : "PLAY";
  return (
    <Button
      variant="quiet"
      aria-label={running ? "Stop Game" : "Play Game"}
      aria-disabled={refusal ? true : undefined}
      title={refusal}
      onClick={onClick}
      class={
        refusal
          ? "size-12 cursor-default flex-col gap-0 rounded-full p-0 text-[11px] font-medium text-accent opacity-40"
          : "size-12 flex-col gap-0 rounded-full p-0 text-[11px] font-medium text-accent"
      }
    >
      <Icon class="size-[18px]" />
      {label}
    </Button>
  );
}

function IconButton({
  ariaLabel,
  icon: Icon,
  dimmed = false,
  onClick,
}: {
  ariaLabel: string;
  icon: IconComponent;
  dimmed?: boolean;
  onClick?: () => void;
}) {
  return (
    <Button
      variant="quiet"
      size="icon"
      aria-label={ariaLabel}
      onClick={onClick}
      class={dimmed ? "text-muted" : "text-ink"}
    >
      <Icon />
    </Button>
  );
}

function PointerHoldButton({
  ariaLabel,
  icon: Icon,
  onStart,
  onStop,
}: {
  ariaLabel: string;
  icon: IconComponent;
  onStart: () => void;
  onStop: () => void;
}) {
  return (
    <Button
      variant="quiet"
      size="icon"
      aria-label={ariaLabel}
      onPointerDown={onStart}
      onPointerUp={onStop}
      onPointerCancel={onStop}
      onPointerLeave={onStop}
    >
      <Icon class="size-4" />
    </Button>
  );
}

function Spinner() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="4" cy="12" r="3">
        <animate
          id="impower-spinner-1"
          begin="0;impower-spinner-3.end+0.25s"
          attributeName="cy"
          calcMode="spline"
          dur="0.6s"
          values="12;6;12"
          keySplines=".33,.66,.66,1;.33,0,.66,.33"
        />
      </circle>
      <circle cx="12" cy="12" r="3">
        <animate
          begin="impower-spinner-1.begin+0.1s"
          attributeName="cy"
          calcMode="spline"
          dur="0.6s"
          values="12;6;12"
          keySplines=".33,.66,.66,1;.33,0,.66,.33"
        />
      </circle>
      <circle cx="20" cy="12" r="3">
        <animate
          id="impower-spinner-3"
          begin="impower-spinner-1.begin+0.2s"
          attributeName="cy"
          calcMode="spline"
          dur="0.6s"
          values="12;6;12"
          keySplines=".33,.66,.66,1;.33,0,.66,.33"
        />
      </circle>
    </svg>
  );
}
