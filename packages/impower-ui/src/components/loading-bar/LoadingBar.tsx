import { cva } from "class-variance-authority";
import type { JSX, Ref } from "preact";
import { cn } from "../../utils/cn";

export type LoadingBarProps = {
  /**
   * Forward a ref to the outer container so callers can imperatively control
   * visibility (e.g., fade in/out) without re-rendering the Preact tree.
   */
  containerRef?: Ref<HTMLDivElement>;
  class?: string;
  style?: JSX.CSSProperties;
};

const loadingBar = cva([
  // 2px tall indeterminate bar; color via currentColor (text-* utility).
  // Width is `var(--loading-indicator-width, 100%)` so callers can override
  // by setting that CSS variable on any ancestor — used by the script
  // editor to size the bar to overlap the active sub-tab's underline
  // (50% of the panel for main, 100% when no sub-tabs).
  "relative h-0.5 min-w-20 overflow-hidden text-primary pointer-events-none w-[var(--loading-indicator-width,100%)]",
]);

// Mirrors sparkle's `<s-progress-bar>` indeterminate animation exactly:
//   2.5s loop, `cubic-bezier(0.37, 0, 0.63, 1)` (ease-in-out-sine), single
//   bar at 50% width that translates from `-50%` (peeking in on the left)
//   to `+100%` (off the right edge), with a 25% pause at the end of the
//   loop. Looks like a gentle "sweep" across the bar rather than the
//   harder Material-Design two-bar motion this component used to have.
const KEYFRAMES = `
@keyframes impower-loading-sweep {
  0% { transform: translateX(-50%) scaleX(0.5); }
  75%, 100% { transform: translateX(100%) scaleX(0.5); }
}
`;

// Exported both ways: the `./components` barrel re-exports the `default` as a
// named `LoadingBar` (so `dist/impower-ui.js` exposes a named export), while
// the `./loading-bar` subpath resolves to this source in dev/webview builds.
// Consumers import `{ LoadingBar }` (named) so the same import works whether it
// resolves to the dist barrel (prod) or this source (dev) — see the `exports`
// map in impower-ui's package.json.
export function LoadingBar({
  containerRef,
  class: className,
  style,
}: LoadingBarProps) {
  return (
    <div
      ref={containerRef}
      role="progressbar"
      aria-busy="true"
      class={cn(loadingBar(), className)}
      style={style}
    >
      <style>{KEYFRAMES}</style>
      <div
        class="absolute inset-0 bg-current"
        style={{
          transformOrigin: "left",
          animation: "impower-loading-sweep 2.5s cubic-bezier(0.37, 0, 0.63, 1) infinite",
        }}
      />
    </div>
  );
}

// Kept so the `./components` barrel's `export { default as LoadingBar }` and
// any default importers continue to resolve.
export default LoadingBar;
