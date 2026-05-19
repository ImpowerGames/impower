import { cva } from "class-variance-authority";
import type { Ref } from "preact";
import { cn } from "../../utils/cn";

export type LoadingBarProps = {
  /**
   * Forward a ref to the outer container so callers can imperatively control
   * visibility (e.g., fade in/out) without re-rendering the Preact tree.
   */
  containerRef?: Ref<HTMLDivElement>;
  class?: string;
};

const loadingBar = cva([
  // 2px tall indeterminate bar; color via currentColor (text-* utility).
  "relative h-0.5 min-w-20 w-full overflow-hidden text-primary pointer-events-none",
]);

// Material Design Components-style indeterminate animation: two bars that
// translate and scale to produce continuous-progress motion. Keyframes are
// inlined as a <style> child so the component works equally well in light DOM
// and shadow DOM. Animation properties are applied via inline style to avoid
// any Tailwind arbitrary-value resolution surprises.
const KEYFRAMES = `
@keyframes impower-loading-primary-translate {
  0% { transform: translateX(0); }
  20% { animation-timing-function: cubic-bezier(0.5, 0, 0.701732, 0.495819); transform: translateX(0); }
  59.15% { animation-timing-function: cubic-bezier(0.302435, 0.381352, 0.55, 0.956352); transform: translateX(83.6714%); }
  100% { transform: translateX(200.611%); }
}
@keyframes impower-loading-secondary-translate {
  0% { animation-timing-function: cubic-bezier(0.15, 0, 0.515058, 0.409685); transform: translateX(0); }
  25% { animation-timing-function: cubic-bezier(0.31033, 0.284058, 0.8, 0.733712); transform: translateX(37.6519%); }
  48.35% { animation-timing-function: cubic-bezier(0.4, 0.627035, 0.6, 0.902026); transform: translateX(84.3862%); }
  100% { transform: translateX(160.278%); }
}
@keyframes impower-loading-primary-scale {
  0% { transform: scaleX(0.08); }
  36.65% { animation-timing-function: cubic-bezier(0.334731, 0.12482, 0.785844, 1); transform: scaleX(0.08); }
  69.15% { animation-timing-function: cubic-bezier(0.06, 0.11, 0.6, 1); transform: scaleX(0.661479); }
  100% { transform: scaleX(0.08); }
}
@keyframes impower-loading-secondary-scale {
  0% { animation-timing-function: cubic-bezier(0.205028, 0.057051, 0.57661, 0.453971); transform: scaleX(0.08); }
  19.15% { animation-timing-function: cubic-bezier(0.152313, 0.196432, 0.648374, 1.00432); transform: scaleX(0.457104); }
  44.15% { animation-timing-function: cubic-bezier(0.257759, -0.003163, 0.211762, 1.38179); transform: scaleX(0.72796); }
  100% { transform: scaleX(0.08); }
}
`;

export default function LoadingBar({
  containerRef,
  class: className,
}: LoadingBarProps) {
  return (
    <div
      ref={containerRef}
      role="progressbar"
      aria-busy="true"
      class={cn(loadingBar(), className)}
    >
      <style>{KEYFRAMES}</style>
      <div class="absolute inset-0 flex items-center overflow-hidden">
        <div
          class="absolute w-full h-full origin-left"
          style={{
            insetInlineStart: "-145.167%",
            animation:
              "impower-loading-primary-translate 2s linear infinite",
          }}
        >
          <div
            class="absolute inset-0 bg-current origin-left"
            style={{
              animation:
                "impower-loading-primary-scale 2s linear infinite",
            }}
          />
        </div>
        <div
          class="absolute w-full h-full origin-left"
          style={{
            insetInlineStart: "-54.8889%",
            animation:
              "impower-loading-secondary-translate 2s linear infinite",
          }}
        >
          <div
            class="absolute inset-0 bg-current origin-left"
            style={{
              animation:
                "impower-loading-secondary-scale 2s linear infinite",
            }}
          />
        </div>
      </div>
    </div>
  );
}
