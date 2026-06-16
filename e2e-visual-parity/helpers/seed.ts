import type { Page } from "@playwright/test";

export interface Fixture {
  /** Project display name — written to OPFS `.name` so neither app shows "Untitled Game". */
  projectName: string;
  /** Contents of `main.sd`. */
  mainSd: string;
  /** Additional project files. */
  files?: { name: string; text?: string; bytes?: Uint8Array }[];
  /** Optional pinned pane/panel/open-file layout (localStorage `workspace/local`). */
  workspaceState?: unknown;
}

/**
 * Puts an app into an identical, deterministic state (§4): clears localStorage +
 * OPFS, pins `project="local"`, seeds the fixture files under OPFS dir "local",
 * then reloads to boot the app against the seeded workspace.
 *
 * OPFS requires a document, so we navigate to the origin first, reset+seed, then
 * reload.
 */
export async function seedProject(page: Page, origin: string, fixture: Fixture) {
  await page.goto(origin + "/");
  await page.evaluate(async (fx) => {
    // 1. RESET: clear localStorage + OPFS root.
    localStorage.clear();
    const root = await navigator.storage.getDirectory();
    for await (const name of (root as any).keys()) {
      await root.removeEntry(name, { recursive: true }).catch(() => {});
    }

    // 2. pin the deterministic local project (offline 'cached' branch, no network).
    localStorage.setItem("project", "local");

    // 3. seed OPFS under directory "local".
    const dir = await root.getDirectoryHandle("local", { create: true });
    const enc = new TextEncoder();
    async function write(name: string, bytes: Uint8Array) {
      const fh = await dir.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(bytes);
      await w.close();
    }
    await write(".name", enc.encode(fx.projectName));
    await write("main.sd", enc.encode(fx.mainSd));
    for (const f of fx.files ?? []) {
      await write(f.name, f.bytes ?? enc.encode(f.text ?? ""));
    }

    // 4. pin pane/panel/open-file layout so both apps start on the identical view.
    if (fx.workspaceState != null) {
      localStorage.setItem("workspace/local", JSON.stringify(fx.workspaceState));
    }
  }, fixture);
  // Re-navigate (not reload) to boot the app against the seeded OPFS — reload
  // can abort if the app triggers its own navigation during the first boot.
  await page.goto(origin + "/", { waitUntil: "domcontentloaded" });
}
