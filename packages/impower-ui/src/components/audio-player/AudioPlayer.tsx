import { cva, type VariantProps } from "class-variance-authority";
import type { JSX } from "preact";
import { cn } from "../../utils/cn";
import PlayButton from "../play-button/PlayButton";

export type AudioPlayerState = "loading" | "ready" | "failed" | "playing";

export const audioPlayerVariants = cva("rounded-[12px] border border-solid border-edge text-ink", {
  variants: {
    size: {
      default: "px-3 py-[18px]",
    },
  },
  defaultVariants: { size: "default" },
});

export type AudioPlayerSize = NonNullable<VariantProps<typeof audioPlayerVariants>["size"]>;

export const audioWaveVariants = cva("relative flex h-10 items-center", {
  variants: {
    loading: {
      true: "motion-safe:animate-pulse",
      false: "",
    },
  },
  defaultVariants: { loading: false },
});

export type AudioPlayerProps = VariantProps<typeof audioPlayerVariants> & {
  name: string;
  state: AudioPlayerState;
  peaks?: readonly number[] | null;
  time: number;
  duration: number | null;
  failure?: string;
  onToggle: () => void;
  onSeek: (seconds: number) => void;
  class?: string;
};

export const clock = (seconds: number) => {
  const whole = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
};

const KEY_STEP_SHARE = 1 / 20;
const KEY_STEP_MIN = 0.5;

function Bars({ peaks, class: className }: { peaks: readonly number[]; class: string }) {
  return (
    <svg
      viewBox={`0 0 ${peaks.length} 100`}
      preserveAspectRatio="none"
      aria-hidden="true"
      class={cn("pointer-events-none absolute inset-0 block size-full", className)}
    >
      {peaks.map((peak, index) => {
        const height = Math.max(3, Math.sqrt(peak / 100) * 100);
        return <rect key={index} x={index + 0.2} y={(100 - height) / 2} width={0.6} height={height} />;
      })}
    </svg>
  );
}

export default function AudioPlayer({
  name,
  state,
  peaks,
  time,
  duration,
  failure,
  size,
  onToggle,
  onSeek,
  class: className,
}: AudioPlayerProps) {
  const length = duration ?? 0;
  const share = length > 0 ? Math.min(1, Math.max(0, time / length)) : 0;
  const played = { "--played": `${(share * 100).toFixed(2)}%` } as JSX.CSSProperties;
  const drawn = !!peaks?.length;

  const seekAt = (event: PointerEvent) => {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (box.width > 0 && length > 0) {
      onSeek(Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)) * length);
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    const step = Math.max(KEY_STEP_MIN, length * KEY_STEP_SHARE);
    const to: Record<string, number> = {
      ArrowRight: time + step,
      ArrowUp: time + step,
      ArrowLeft: time - step,
      ArrowDown: time - step,
      Home: 0,
      End: length,
    };
    if (event.key === " ") {
      event.preventDefault();
      onToggle();
      return;
    }
    if (Object.hasOwn(to, event.key)) {
      event.preventDefault();
      onSeek(Math.min(length, Math.max(0, to[event.key]!)));
    }
  };

  return (
    <div
      class={cn(audioPlayerVariants({ size }), className)}
      data-audio-player
      data-state={state}
    >
      {state === "failed" ? (
        <p class="m-0 flex min-h-[52px] items-center justify-center text-center text-[13px]/[1.5] text-muted" role="status">
          {failure}
        </p>
      ) : (
        <div class="flex items-center gap-1.5">
          <PlayButton
            size="large"
            name={name}
            playing={state === "playing"}
            data-audio-toggle
            onClick={onToggle}
          />
          <div class="relative min-w-0 flex-1 px-1.5">
            <div
              class={audioWaveVariants({ loading: state === "loading" })}
              style={played}
              data-audio-wave
              data-wave={drawn ? "drawn" : "plain"}
            >
              {drawn ? (
                <>
                  <Bars peaks={peaks!} class="fill-muted/45" />
                  <Bars peaks={peaks!} class="fill-accent [clip-path:inset(0_calc(100%-var(--played))_0_0)]" />
                  <span class="pointer-events-none absolute inset-y-0.5 left-(--played) -ml-px w-0.5 rounded-[1px] bg-accent" />
                </>
              ) : (
                <span class="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-muted/45">
                  <span class="absolute inset-y-0 left-0 w-(--played) bg-accent" />
                </span>
              )}
              <div
                role="slider"
                tabIndex={0}
                aria-label="Position"
                aria-valuemin={0}
                aria-valuemax={Math.round(length)}
                aria-valuenow={Math.round(Math.min(time, length))}
                aria-valuetext={`${clock(time)} of ${clock(Math.round(length))}`}
                class="absolute inset-0 cursor-pointer touch-pan-y rounded-[4px] outline-none focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-accent"
                onKeyDown={onKeyDown}
                onPointerDown={(event) => {
                  if (event.button !== 0) {
                    return;
                  }
                  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
                  seekAt(event);
                }}
                onPointerMove={(event) => {
                  if ((event.currentTarget as HTMLElement).hasPointerCapture?.(event.pointerId)) {
                    seekAt(event);
                  }
                }}
              />
            </div>
            <div class="absolute inset-x-1.5 top-[calc(100%+1px)] flex justify-between text-[11px]/[14px] whitespace-nowrap text-muted tabular-nums">
              <span data-audio-elapsed>{clock(time)}</span>
              <span data-audio-total>{clock(Math.round(length))}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
