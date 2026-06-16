import type { Locator, Page } from "@playwright/test";

/**
 * Cross-app element resolution (§5). The baseline is shadow-DOM web components;
 * the port is light-DOM Preact. `id`/class/tag selectors are dead cross-app —
 * what both share is ARIA role + accessible name + visible text, the identical
 * CodeMirror internals (`.cm-*`, same library in both), and the game `<iframe>`.
 *
 * Each handle returns a `Locator` resolving the SAME logical element in either
 * app. Prefer role/text here; the role-less hotspots that need shared
 * `data-testid`s (and thus a baseline edit) are deferred — see spec §5.
 */
export const h = {
  // --- Header ---
  /** Project-name field (real ARIA textbox in both). */
  projectName: (p: Page): Locator => p.getByRole("textbox", { name: /project name/i }),
  /** Sync status caption — text identical across apps. */
  syncCaption: (p: Page): Locator =>
    p.getByText(/saved in cache|syncing|saving|saved|conflict|offline/i).first(),

  // --- Bottom nav (Logic / Assets / Share) ---
  bottomTab: (p: Page, name: "Logic" | "Assets" | "Share"): Locator =>
    p.getByRole("tab", { name }),

  // --- Logic sub-tabs (Main / Scripts) ---
  subTab: (p: Page, name: "Main" | "Scripts"): Locator =>
    p.getByRole("tab", { name }),

  // --- Script editor (identical CodeMirror internals in both apps) ---
  editor: (p: Page): Locator => p.locator(".cm-editor").first(),
  editorContent: (p: Page): Locator => p.locator(".cm-content").first(),
  editorGutters: (p: Page): Locator => p.locator(".cm-gutters").first(),

  // --- Preview ---
  /** Game-preview iframe (same external element in both). */
  gameIframe: (p: Page): Locator => p.locator("#iframe"),
};

export type Handles = typeof h;
