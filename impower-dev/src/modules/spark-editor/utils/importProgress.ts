import workspace from "../workspace/WorkspaceStore";

// Keep the bar visible at least this long so a fast (small) import doesn't
// flash a 1-frame bar — the user still gets a clear "something happened".
const MIN_VISIBLE_MS = 400;

// A monotonic per-call token, and the token that currently OWNS the shared
// `importProgress` signal. Ownership keys on this unique token, NOT on `total`
// (the file count, which isn't unique): two overlapping imports must not
// corrupt or prematurely clear each other's bar. The most recently started
// import owns the signal; an earlier import that finishes mid-overlap sees it
// no longer owns it and leaves the signal untouched. The acted-on files all
// write regardless — only the (single, shared) progress bar is arbitrated.
let seq = 0;
let ownerToken = 0;

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
  const token = ++seq;
  ownerToken = token;
  const startedAt = Date.now();
  workspace.importProgress.value = { loaded: 0, total };
  const advance = () => {
    // Only touch the signal while we still own it (a newer import may have
    // taken over).
    if (ownerToken !== token) {
      return;
    }
    const cur = workspace.importProgress.value;
    if (cur) {
      workspace.importProgress.value = {
        loaded: Math.min(cur.loaded + 1, total),
        total,
      };
    }
  };
  try {
    return await run(advance);
  } finally {
    // Never clobber the signal if a newer import has claimed it.
    if (ownerToken === token) {
      workspace.importProgress.value = { loaded: total, total };
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_VISIBLE_MS) {
        await new Promise((resolve) =>
          setTimeout(resolve, MIN_VISIBLE_MS - elapsed),
        );
      }
      // Re-check after the sleep — a newer import may have started during it.
      if (ownerToken === token) {
        workspace.importProgress.value = null;
      }
    }
  }
}
