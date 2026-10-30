import workspace from "../workspace/WorkspaceStore";

const MIN_VISIBLE_MS = 400;

let seq = 0;
let ownerToken = 0;

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
    if (ownerToken === token) {
      workspace.importProgress.value = { loaded: total, total };
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_VISIBLE_MS) {
        await new Promise((resolve) =>
          setTimeout(resolve, MIN_VISIBLE_MS - elapsed),
        );
      }
      if (ownerToken === token) {
        workspace.importProgress.value = null;
      }
    }
  }
}
