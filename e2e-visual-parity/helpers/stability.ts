import type { Page } from "@playwright/test";

/**
 * Async settling gate (§4). Minimal P0 version: reveal-opacity gate + fonts +
 * the bottom-nav tablist being present. Later phases extend this with the LSP
 * first-compile and `getFiles` resolution via `window.__parity` test hooks.
 */
export async function awaitStable(page: Page, opts: { timeout?: number } = {}) {
  const timeout = opts.timeout ?? 30_000;

  // 1. reveal gate — pages/index.ts sets documentElement opacity to "1" after init.
  await page
    .waitForFunction(() => document.documentElement.style.opacity === "1", null, {
      timeout,
    })
    .catch(() => {
      /* some builds reveal without setting inline opacity; fall through */
    });

  // 2. fonts settled (text metrics — header title/caption widths depend on this).
  await page.evaluate(() => (document as any).fonts?.ready).catch(() => {});

  // 3. the editor shell has rendered its bottom-nav tablist.
  await page
    .locator('[role="tablist"]')
    .first()
    .waitFor({ state: "visible", timeout })
    .catch(() => {});

  // 4. brief settle for late micro-task renders (skeletons unmounting, etc.).
  await page.waitForTimeout(400);
}
