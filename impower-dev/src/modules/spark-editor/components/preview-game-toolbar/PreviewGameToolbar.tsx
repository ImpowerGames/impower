import {
  BugOff,
  Button,
  Check,
  DropdownCheckboxItem,
  DropdownContent,
  DropdownRoot,
  DropdownTrigger,
  Gear,
  Notes,
  PlayerPauseFill,
  PlayerPlay,
  PlayerPlayFill,
  PlayerSkipBackwardFill,
  PlayerSkipForwardFill,
  PlayerStop,
  PlayerTrackNextFill,
  PlayerTrackPreviousFill,
} from "@impower/impower-ui/components";
import type { IconComponent } from "@impower/impower-ui/components";
import { useEffect, useRef } from "preact/hooks";
import throttle from "../../utils/throttle";
import workspace from "../../workspace/WorkspaceStore";

export const propDefaults = {};
export type PreviewGameToolbarProps = Partial<typeof propDefaults>;

/**
 * Top toolbar inside the game preview pane. Three visual states driven
 * by workspace.preview.modes.game:
 *
 *   loading=true  → spinner (left) + "Game Preview" title + mode toggle
 *   running=false → PLAY button + title + mode toggle
 *   running=true  → STOP button + playback controls + settings dropdown
 *
 * The step-backward/forward and fast-backward/forward buttons hold-to-
 * scrub via requestAnimationFrame + throttled stepGameClock — matches the
 * legacy spec-component's UX (pointerdown starts the rAF loop, pointerup
 * cancels it).
 */
export default function PreviewGameToolbar(_props: PreviewGameToolbarProps) {
  const game = workspace.state.value.preview?.modes?.game;
  const running = !!game?.running;
  const paused = !!game?.paused;
  const debugging = !!game?.debugging;
  const loading = !!game?.loading;

  // Hold-to-scrub rAF id, kept in a ref so the cleanup function can cancel
  // even after the component re-renders.
  const controllingPlayback = useRef<number>(0);

  // Cleanup the rAF on unmount so a dangling pointerdown without a
  // pointerup (e.g. mid-drag tab switch) doesn't leave the game stepping
  // forever.
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

  const onModeToggle = async () => {
    const { Workspace } = await import("../../workspace/Workspace");
    Workspace.window.changedPreviewMode("screenplay");
  };

  const onPauseToggle = async () => {
    const { Workspace } = await import("../../workspace/Workspace");
    Workspace.window.toggleGamePaused();
  };

  const onDebugChange = async (next: boolean) => {
    const { Workspace } = await import("../../workspace/Workspace");
    if (next) Workspace.window.enableDebugging();
    else Workspace.window.disableDebugging();
  };

  return (
    <div class="sticky top-0 z-[1] flex h-12 flex-row items-center bg-engine-900">
      {/* Run-toggle button — always visible. Loading state shows spinner;
          ready state shows PLAY/STOP depending on `running`. */}
      <RunToggle
        loading={loading}
        running={running}
        onClick={loading ? undefined : onRunToggle}
      />

      <span class="flex-1" />

      {/* Middle slot: title when stopped, playback controls when running.
          Wrapped in flex-1 spacers on both sides so the controls stay
          centered. */}
      {running ? (
        <div class="flex flex-row items-center">
          <PointerHoldButton
            ariaLabel="Step Backward"
            icon={PlayerSkipBackwardFill}
            onStart={() => startPlayback(-0.01)}
            onStop={stopPlayback}
          />
          <PointerHoldButton
            ariaLabel="Fast Backward"
            icon={PlayerTrackPreviousFill}
            onStart={() => startPlayback(-0.1)}
            onStop={stopPlayback}
          />
          <IconButton
            ariaLabel={paused ? "Play" : "Pause"}
            icon={paused ? PlayerPlayFill : PlayerPauseFill}
            iconSize={20}
            onClick={onPauseToggle}
          />
          <PointerHoldButton
            ariaLabel="Fast Forward"
            icon={PlayerTrackNextFill}
            onStart={() => startPlayback(0.1)}
            onStop={stopPlayback}
          />
          <PointerHoldButton
            ariaLabel="Step Forward"
            icon={PlayerSkipForwardFill}
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

      {/* Right slot: mode toggle when stopped, settings dropdown when running. */}
      {running ? (
        <DropdownRoot>
          <DropdownTrigger asChild>
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label="Settings"
              class="text-foreground/50 hover:text-foreground"
            >
              <Gear class="size-5" />
            </Button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownCheckboxItem
              checked={debugging}
              onCheckedChange={onDebugChange}
            >
              {debugging ? (
                <Check class="size-4" />
              ) : (
                <BugOff class="size-4" />
              )}
              <span>Debugging</span>
            </DropdownCheckboxItem>
          </DropdownContent>
        </DropdownRoot>
      ) : (
        <IconButton
          ariaLabel="Preview Screenplay"
          icon={Notes}
          iconSize={20}
          dimmed
          onClick={onModeToggle}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Local sub-components
// ----------------------------------------------------------------------------

function RunToggle({
  loading,
  running,
  onClick,
}: {
  loading: boolean;
  running: boolean;
  onClick?: () => void;
}) {
  if (loading) {
    return (
      <div class="flex h-11 w-12 flex-col items-center justify-center text-primary/70">
        <Spinner />
      </div>
    );
  }
  const Icon = running ? PlayerStop : PlayerPlay;
  const label = running ? "STOP" : "PLAY";
  return (
    <Button
      variant="ghost"
      aria-label={running ? "Stop Game" : "Play Game"}
      onClick={onClick}
      class="h-12 w-12 flex-col gap-0.5 rounded-full pt-1 px-0 text-[11px] font-semibold text-primary"
    >
      <Icon class="size-[18px]" />
      {label}
    </Button>
  );
}

function IconButton({
  ariaLabel,
  icon: Icon,
  iconSize = 16,
  dimmed = false,
  onClick,
}: {
  ariaLabel: string;
  icon: IconComponent;
  iconSize?: number;
  dimmed?: boolean;
  onClick?: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-lg"
      aria-label={ariaLabel}
      onClick={onClick}
      class={
        dimmed
          ? "text-foreground/50 hover:text-foreground"
          : "text-foreground"
      }
    >
      <Icon style={{ width: `${iconSize}px`, height: `${iconSize}px` }} />
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
      variant="ghost"
      size="icon-lg"
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

// Loading spinner — three dots that bounce vertically. Inlined as a
// dedicated SVG (the legacy version was an inline <svg> with <animate>
// elements; we keep the exact same animation so the pacing matches).
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
