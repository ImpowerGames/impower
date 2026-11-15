import { willDeleteFilesRefusal } from "@impower/spark-editor-protocol/src/protocols/workspace/WillDeleteFilesMessage";

export async function trashSkipped(deletion: Promise<unknown>): Promise<string[]> {
  try {
    await deletion;
    return [];
  } catch (error) {
    const refusal = willDeleteFilesRefusal(error);
    if (!refusal) throw error;
    return refusal.skipped;
  }
}

export function trashAttempts() {
  let pendingSince: number | undefined;
  return async (trash: () => Promise<unknown>): Promise<number> => {
    const since = (pendingSince ??= Date.now());
    await trash();
    pendingSince = undefined;
    return since;
  };
}
