import {
  Button,
  PlayerPauseFill,
  PlayerPlayFill,
  Refresh,
} from "@impower/impower-ui/components";
import { useEffect, useRef, useState } from "preact/hooks";

export type AudioPreviewProps = {
  src: string;
};

// Number of waveform bars rendered across the track. Independent of the canvas
// width (we stretch the bars to fit), so the decode cost is constant.
const BAR_COUNT = 200;

const formatTime = (seconds: number): string => {
  const s = !isFinite(seconds) || seconds < 0 ? 0 : seconds;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

/**
 * Audio-file preview with a waveform scrubber. Decodes the audio with the Web
 * Audio API to compute static peak data, renders it to a canvas (played portion
 * highlighted), and drives playback through a hidden `<audio>` element. Click or
 * drag the waveform to seek. If decoding fails (e.g. a cross-origin remote URL
 * with no CORS headers) the canvas falls back to a flat seekable baseline — the
 * audio still plays, just without a rendered waveform.
 *
 * Self-contained (no `wavesurfer.js`): the old engine's player pulled in that
 * dependency; this keeps the file manager lean.
 */
export default function AudioPreview({ src }: AudioPreviewProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Decode the audio once to compute the static waveform peaks.
  useEffect(() => {
    let cancelled = false;
    setPeaks(null);
    (async () => {
      try {
        const res = await fetch(src);
        const buf = await res.arrayBuffer();
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ac = new Ctx();
        const audioBuf = await ac.decodeAudioData(buf);
        void ac.close();
        if (cancelled) {
          return;
        }
        const data = audioBuf.getChannelData(0);
        const block = Math.floor(data.length / BAR_COUNT) || 1;
        const out: number[] = [];
        for (let i = 0; i < BAR_COUNT; i += 1) {
          let max = 0;
          const start = i * block;
          for (let j = 0; j < block; j += 1) {
            const v = Math.abs(data[start + j] ?? 0);
            if (v > max) {
              max = v;
            }
          }
          out.push(max);
        }
        const norm = Math.max(...out, 0.0001);
        setPeaks(out.map((v) => v / norm));
      } catch {
        // CORS / unsupported codec: fall back to a flat baseline (still seekable).
        if (!cancelled) {
          setPeaks([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src]);

  // Draw the waveform whenever the peaks, progress, or size change. A played bar
  // is drawn opaque white; the rest are dimmed. Sized to the device pixel ratio
  // so the bars stay crisp.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
        canvas.width = cssW * dpr;
        canvas.height = cssH * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      const bars = peaks && peaks.length > 0 ? peaks : null;
      const n = bars ? bars.length : BAR_COUNT;
      const gap = 1;
      const barW = Math.max(1, cssW / n - gap);
      const mid = cssH / 2;
      const progress = duration > 0 ? currentTime / duration : 0;
      for (let i = 0; i < n; i += 1) {
        const amp = bars ? bars[i]! : 0.04; // flat baseline when no peaks
        const h = Math.max(2, amp * cssH);
        const x = (i / n) * cssW;
        const played = i / n < progress;
        ctx.fillStyle = played ? "#ffffff" : "rgba(255,255,255,0.28)";
        const r = Math.min(barW / 2, 2);
        const y = mid - h / 2;
        // rounded bar
        ctx.beginPath();
        ctx.roundRect(x, y, barW, h, r);
        ctx.fill();
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [peaks, currentTime, duration]);

  // Smooth playhead: <audio>'s timeupdate fires only ~4×/s, so poll
  // currentTime on a rAF loop while playing for a fluid scrubber.
  useEffect(() => {
    if (!playing) {
      return;
    }
    let raf = 0;
    const tick = () => {
      const a = audioRef.current;
      if (a) {
        setCurrentTime(a.currentTime);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) {
      return;
    }
    if (a.paused) {
      void a.play();
    } else {
      a.pause();
    }
  };

  const restart = () => {
    const a = audioRef.current;
    if (a) {
      a.currentTime = 0;
      setCurrentTime(0);
    }
  };

  // Seek by mapping the pointer's x within the canvas to a fraction of duration.
  const seekFromEvent = (e: PointerEvent) => {
    const canvas = canvasRef.current;
    const a = audioRef.current;
    if (!canvas || !a || !duration) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    a.currentTime = frac * duration;
    setCurrentTime(a.currentTime);
  };

  const scrubbing = useRef(false);

  return (
    <div class="m-auto flex w-full max-w-2xl flex-col gap-5 px-2">
      <audio
        ref={audioRef}
        src={src}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setCurrentTime((e.target as HTMLAudioElement).currentTime)}
        onLoadedMetadata={(e) =>
          setDuration((e.target as HTMLAudioElement).duration)
        }
        class="hidden"
      />

      <canvas
        ref={canvasRef}
        class="h-28 w-full cursor-pointer touch-none select-none"
        onPointerDown={(e) => {
          scrubbing.current = true;
          (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
          seekFromEvent(e);
        }}
        onPointerMove={(e) => {
          if (scrubbing.current) {
            seekFromEvent(e);
          }
        }}
        onPointerUp={(e) => {
          scrubbing.current = false;
          (e.currentTarget as HTMLCanvasElement).releasePointerCapture(
            e.pointerId,
          );
        }}
      />

      <div class="flex select-none flex-row items-center gap-4">
        <span class="w-10 text-right text-xs tabular-nums text-white/60">
          {formatTime(currentTime)}
        </span>
        <div class="flex flex-1 flex-row items-center justify-center gap-2">
          <Button
            variant="ghost"
            aria-label="Restart"
            onClick={restart}
            class="size-9 rounded-full p-0 text-white/70 hover:bg-white/10 hover:text-white"
          >
            <Refresh class="size-4" />
          </Button>
          <Button
            variant="ghost"
            aria-label={playing ? "Pause" : "Play"}
            onClick={togglePlay}
            class="size-12 rounded-full p-0 text-white hover:bg-white/10"
          >
            {playing ? (
              <PlayerPauseFill class="size-7" />
            ) : (
              <PlayerPlayFill class="size-7" />
            )}
          </Button>
        </div>
        <span class="w-10 text-left text-xs tabular-nums text-white/60">
          {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}
