import { willDeleteFilesRefusal } from "@impower/spark-editor-protocol/src/protocols/workspace/WillDeleteFilesMessage";

const leafOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

export const keptMessage = (paths: readonly string[]) => {
  const names = paths.map(leafOf);
  const one = names.length === 1;
  return `Couldn't move ${names.join(", ")} to the bin. ${one ? "It is" : "They are"} still where ${one ? "it was" : "they were"}.`;
};

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

export function trashAttempts(refused: (skipped: string[]) => void) {
  let pendingSince: number | undefined;
  return async (trash: () => Promise<unknown>): Promise<number> => {
    const since = (pendingSince ??= Date.now());
    try {
      await trash();
    } catch (error) {
      const refusal = willDeleteFilesRefusal(error);
      if (refusal) refused(refusal.skipped);
      throw error;
    }
    pendingSince = undefined;
    return since;
  };
}
