import { Fragment, type Ref } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { CompletionPreviewStatus } from "@impower/spark-editor-protocol/src/protocols/preview/GameStateMessage";
import {
  completionStatusText,
  endingStatusHover,
  endingStatusText,
  playerBarLocation,
  type PlayerBarState,
} from "./playerBarState";
import { useHoldRepeat } from "./useHoldRepeat";

const COMPLETION_PREPARING_STATUS_DELAY = 150;

export interface PlayerBarControls {
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
  onSkip?: (direction: -1 | 1) => void;
  onPause?: () => void;
  onResume?: () => void;
  onStep?: (traversal: "in" | "out") => void;
  onToggleFullscreen?: () => void;
}

const stopPointer = (e: PointerEvent) => e.stopPropagation();

function SkipButton({
  direction,
  onSkip,
}: {
  direction: -1 | 1;
  onSkip?: (direction: -1 | 1) => void;
}) {
  const hold = useHoldRepeat(() => onSkip?.(direction));
  const label = direction < 0 ? "Skip back" : "Skip forward";
  return (
    <button
      type="button"
      class="toolbar-button transport-button"
      aria-label={label}
      title={label}
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

const useShownCompletion = (status: CompletionPreviewStatus | null) => {
  const [shown, setShown] = useState<CompletionPreviewStatus | null>(status);
  useEffect(() => {
    if (status === "preparing" && shown == null) {
      const timer = window.setTimeout(
        () => setShown(status),
        COMPLETION_PREPARING_STATUS_DELAY,
      );
      return () => window.clearTimeout(timer);
    }
    setShown(status);
    return undefined;
  }, [status]);
  return shown;
};

export default function PlayerBar({
  state,
  controls,
  workspace,
  routeShown = false,
  snapping = false,
  toolbarRef,
  routeButtonRef,
  savesButtonRef,
  onSkip,
  onPause,
  onResume,
  onStep,
  onToggleFullscreen,
}: PlayerBarProps) {
  const executed = state.executed;
  const location = executed ? playerBarLocation(executed, workspace) : null;
  const connection = location?.connection ?? null;
  const completion = completionStatusText(
    useShownCompletion(state.completion),
    executed != null,
  );
  const ending = state.ending;
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
          {controls.skip ? <SkipButton direction={-1} onSkip={onSkip} /> : null}
          {controls.skip ? <SkipButton direction={1} onSkip={onSkip} /> : null}
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
          data-state={completion ? (state.completion ?? undefined) : undefined}
        >
          {completion}
        </span>
        <span
          id="ending-status"
          role="status"
          hidden={!ending}
          title={ending ? endingStatusHover(ending) : ""}
          data-kind={ending?.kind}
        >
          {ending ? endingStatusText(ending) : ""}
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
