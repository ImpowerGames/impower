import type { Locator, Page } from "@playwright/test";

/**
 * Determinism + masking (§6). Three mechanisms applied in order:
 *  1. `initScript` via context.addInitScript — runs before any app JS.
 *  2. `FREEZE_CSS` via page.addStyleTag — after navigation (re-inject after reloads).
 *  3. `finishAnimations` + screenshot-time SHOT_OPTS (animations/caret/mask).
 */

/** Frozen 2024-06-15T00:00:00Z — neutralizes Date.now() / Math.random() token churn. */
export function initScript() {
  const FIXED = 1718409600000;
  const RealDate = Date;
  // @ts-expect-error override the global Date with a fixed-now subclass
  globalThis.Date = class extends RealDate {
    constructor(...args: unknown[]) {
      super(...((args.length ? args : [FIXED]) as []));
    }
    static now() {
      return FIXED;
    }
  };
  let seed = 42;
  Math.random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}

/** Kills CSS transitions/animations, SMIL, caret blink, smooth scroll. */
export const FREEZE_CSS = `
*, *::before, *::after {
  transition: none !important;
  transition-delay: 0s !important;
  transition-duration: 0s !important;
  animation: none !important;
  animation-delay: 0s !important;
  animation-duration: 0s !important;
  animation-play-state: paused !important;
  caret-color: transparent !important;
  scroll-behavior: auto !important;
}
svg animate, svg animateTransform, svg animateMotion { display: none !important; }
::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation: none !important; }
`;

export async function injectFreeze(page: Page) {
  await page.addStyleTag({ content: FREEZE_CSS });
}

/** Finishes finite WAAPI animations (Router/Ripple use element.animate(), which CSS can't stop). */
export async function finishAnimations(page: Page) {
  await page.evaluate(() => document.getAnimations().forEach((a) => a.finish()));
}

/** Standing mask set (§6.4) — the live game iframe + CodeMirror cursor/selection/active-line. */
export function alwaysMask(scope: Page | Locator): Locator[] {
  return [
    scope.locator("#iframe"),
    scope.locator(".pg-iframe-wrap"),
    scope.locator("#preview"),
    scope.locator(".cm-cursor, .cm-cursorLayer"),
    scope.locator(".cm-selectionLayer, .cm-selectionBackground"),
    scope.locator(".cm-activeLine, .cm-activeLineGutter"),
  ];
}

/** Screenshot options used for every capture (and diff capture). */
export const SHOT_OPTS = {
  animations: "disabled" as const,
  caret: "hide" as const,
  maskColor: "#1e1e1e",
};
