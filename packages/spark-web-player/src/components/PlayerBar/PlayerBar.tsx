import { Fragment, type Ref } from "preact";
import {
  playerBarLocation,
  runButtonState,
  skipRefusal,
  type PlayerBarState,
} from "./playerBarState";
import { useHoldRepeat } from "./useHoldRepeat";

export interface PlayerBarControls {
  run?: boolean;
  skip?: boolean;
  step?: boolean;
  fullscreen?: boolean;
  resize?: boolean;
}

export interface PlayerBarProps {
  state: PlayerBarState;
  controls: PlayerBarControls;
  workspace?: string;
  routeShown?: boolean;
  snapping?: boolean;
  toolbarRef?: Ref<HTMLDivElement>;
  routeButtonRef?: Ref<HTMLDivElement>;
  savesButtonRef?: Ref<HTMLDivElement>;
  runRefusal?: string;
  starting?: boolean;
  onRun?: () => void;
  onStop?: () => void;
  onSkip?: (direction: -1 | 1) => void;
  onPause?: () => void;
  onResume?: () => void;
  onStep?: (traversal: "in" | "out") => void;
  onToggleFullscreen?: () => void;
}

const stopPointer = (e: PointerEvent) => e.stopPropagation();

function SkipButton({
  direction,
  reason,
  onSkip,
}: {
  direction: -1 | 1;
  reason?: string;
  onSkip?: (direction: -1 | 1) => void;
}) {
  const hold = useHoldRepeat(() => {
    if (reason == null) {
      onSkip?.(direction);
    }
  });
  const label = direction < 0 ? "Skip back" : "Skip forward";
  return (
    <button
      type="button"
      class="toolbar-button transport-button"
      aria-label={label}
      title={reason ?? label}
      disabled={reason != null}
      data-pressed={hold.pressed ? "" : undefined}
      onPointerDown={hold.onPointerDown}
      onPointerUp={hold.onPointerUp}
      onPointerCancel={hold.onPointerCancel}
      onPointerLeave={hold.onPointerLeave}
      onClick={hold.onClick}
    >
      <span
        class="transport-icon"
        data-icon={direction < 0 ? "skip-back" : "skip-forward"}
      />
    </button>
  );
}

function TransportButton({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      class="toolbar-button transport-button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onPointerDown={stopPointer}
      onClick={() => onClick?.()}
    >
      <span class="transport-icon" data-icon={icon} />
    </button>
  );
}

const RUN_LABELS = {
  run: "Run",
  stop: "Stop",
  "run-again": "Run again",
} as const;

function RunButton({
  state,
  refusal,
  starting,
  onRun,
  onStop,
}: {
  state: PlayerBarState;
  refusal?: string;
  starting?: boolean;
  onRun?: () => void;
  onStop?: () => void;
}) {
  const mode = runButtonState(state);
  const label = RUN_LABELS[mode];
  const stopping = mode === "stop";
  const reason = stopping ? undefined : refusal;
  const disabled = !stopping && (reason != null || !!starting);
  return (
    <button
      type="button"
      id="run-button"
      class="toolbar-button transport-button"
      title={reason ?? label}
      aria-disabled={disabled ? "true" : undefined}
      aria-description={reason}
      onPointerDown={stopPointer}
      onClick={() => {
        if (!disabled) {
          (stopping ? onStop : onRun)?.();
        }
      }}
    >
      <span class="transport-icon" data-icon={mode} />
      <span id="run-label">{label}</span>
    </button>
  );
}

export default function PlayerBar({
  state,
  controls,
  workspace,
  routeShown = false,
  snapping = false,
  toolbarRef,
  routeButtonRef,
  savesButtonRef,
  runRefusal,
  starting,
  onRun,
  onStop,
  onSkip,
  onPause,
  onResume,
  onStep,
  onToggleFullscreen,
}: PlayerBarProps) {
  const executed = state.executed;
  const location = executed ? playerBarLocation(executed, workspace) : null;
  const connection = location?.connection ?? null;
  const { completion, ending } = state.statuses;
  const size = state.size;
  const debugging =
    !!controls.step && state.playing && state.launchState !== "ended";
  const stepDisabled = !state.paused || state.stepping;
  return (
    <div
      id="toolbar"
      ref={toolbarRef}
      class={snapping ? "snapping" : undefined}
    >
      {controls.resize ? <div id="resize-handle" /> : null}
      {controls.run ? (
        <RunButton
          state={state}
          refusal={runRefusal}
          starting={starting}
          onRun={onRun}
          onStop={onStop}
        />
      ) : null}
      {controls.skip || debugging ? (
        <div id="transport-items">
          {debugging ? (
            <TransportButton
              icon={state.paused ? "resume" : "pause"}
              label={state.paused ? "Resume" : "Pause"}
              onClick={state.paused ? onResume : onPause}
            />
          ) : null}
          {debugging ? (
            <TransportButton
              icon="step-into"
              label="Step Into"
              disabled={stepDisabled}
              onClick={() => onStep?.("in")}
            />
          ) : null}
          {controls.skip ? (
            <SkipButton
              direction={-1}
              reason={state.playing ? skipRefusal(state.runHistory.history, -1) : undefined}
              onSkip={onSkip}
            />
          ) : null}
          {controls.skip ? (
            <SkipButton
              direction={1}
              reason={state.playing ? skipRefusal(state.runHistory.history, 1) : undefined}
              onSkip={onSkip}
            />
          ) : null}
          {debugging ? (
            <TransportButton
              icon="step-out"
              label="Step Out"
              disabled={stepDisabled}
              onClick={() => onStep?.("out")}
            />
          ) : null}
        </div>
      ) : null}
      <div id="left-items" hidden={!location}>
        <div id="route-button" ref={routeButtonRef} hidden={!routeShown} />
        <div
          id="location-items"
          class={executed?.simulation === "fail" ? "error" : undefined}
          hidden={routeShown}
          title={location?.failure ?? undefined}
          aria-label={location?.failure ?? undefined}
        >
          <div id="launch-info">
            <span
              id="launch-state-icon"
              data-state={state.launchState ?? undefined}
            />
            <span id="launch-label">{location?.launch ?? ""}</span>
          </div>
          <div id="execution-info" hidden={!connection}>
            <span id="connection-label">
              {connection ? "→" : null}
              {connection?.choices.map((choice, index) => (
                <Fragment key={index}>
                  <div>{`  [ ${choice} ]  `}</div>
                  {"→"}
                </Fragment>
              ))}
              {connection?.broken ? " 🞪 →" : null}
            </span>
            <span id="executed-label">{connection?.executed ?? ""}</span>
          </div>
        </div>
      </div>
      <div id="middle-items">
        <span
          id="completion-status"
          role="status"
          hidden={!completion}
          data-state={completion?.status}
        >
          {completion?.text ?? ""}
        </span>
        <span
          id="ending-status"
          role="status"
          hidden={!ending}
          title={ending?.hover ?? ""}
          data-kind={ending?.kind}
        >
          {ending?.text ?? ""}
        </span>
      </div>
      <div id="right-items">
        <div id="saves-button" ref={savesButtonRef} />
        {controls.resize ? (
          <div id="aspect-ratio-label">
            {size?.aspectRatio ? `(${size.aspectRatio})` : ""}
          </div>
        ) : null}
        {controls.resize ? (
          <div id="size-label">
            {size ? `${Math.round(size.width)} × ${Math.round(size.height)}` : ""}
          </div>
        ) : null}
        {controls.fullscreen ? (
          <div
            id="fullscreen-button"
            class="toolbar-button"
            onPointerDown={(e) => {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              e.stopPropagation();
            }}
            onPointerUp={(e) => {
              (e.currentTarget as HTMLElement).releasePointerCapture(
                e.pointerId,
              );
            }}
            onClick={() => onToggleFullscreen?.()}
          >
            <div id="fullscreen-icon" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
