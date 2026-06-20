import workspace from "../workspace/WorkspaceStore";

// Keep the bar visible at least this long so a fast (small) import doesn't
// flash a 1-frame bar — the user still gets a clear "something happened".
const MIN_VISIBLE_MS = 400;

/**
 * Run a multi-file import while publishing progress to the workspace
 * `importProgress` signal (which ImportProgressBar + HeaderTitleCaption read).
 *
 * `total` is the file count. The passed `advance` callback bumps the read
 * counter by one — call it as each file's bytes finish loading, so the bar
 * fills during the (main-thread) read phase. The OPFS write is a single
 * batched call with no per-file signal, so once reads finish the bar simply
 * holds at `total` (full) until `run` resolves, then clears. The `finally`
 * guarantees the bar is removed even if the import throws.
 */
export async function runImport<T>(
  total: number,
  run: (advance: () => void) => Promise<T>,
): Promise<T> {
  if (total <= 0) {
    return run(() => {});
  }
  const startedAt = Date.now();
  workspace.importProgress.value = { loaded: 0, total };
  const advance = () => {
    const cur = workspace.importProgress.value;
    // Guard against a concurrent import having replaced the signal.
    if (cur && cur.total === total) {
      workspace.importProgress.value = {
        loaded: Math.min(cur.loaded + 1, total),
        total,
      };
    }
  };
  try {
    return await run(advance);
  } finally {
    workspace.importProgress.value = { loaded: total, total };
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_VISIBLE_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, MIN_VISIBLE_MS - elapsed),
      );
    }
    // Only clear if we still own the signal (no newer import started).
    const cur = workspace.importProgress.value;
    if (cur && cur.total === total && cur.loaded === total) {
      workspace.importProgress.value = null;
    }
  }
}
