import { cva } from "class-variance-authority";
import type { JSX, Ref } from "preact";
import { cn } from "../../utils/cn";

export type LoadingBarProps = {
  containerRef?: Ref<HTMLDivElement>;
  class?: string;
  style?: JSX.CSSProperties;
};

const loadingBar = cva([
  "relative h-0.5 min-w-20 overflow-hidden text-primary pointer-events-none w-[var(--loading-indicator-width,100%)]",
]);

const KEYFRAMES = `
@keyframes impower-loading-sweep {
  0% { transform: translateX(-50%) scaleX(0.5); }
  75%, 100% { transform: translateX(100%) scaleX(0.5); }
}
`;

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

export default LoadingBar;
