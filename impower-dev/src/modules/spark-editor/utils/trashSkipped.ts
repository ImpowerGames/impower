import { willDeleteFilesRefusal } from "@impower/spark-editor-protocol/src/protocols/workspace/WillDeleteFilesMessage";

const leafOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

export const keptMessage = (paths: readonly string[]) => {
  const names = paths.map(leafOf);
  const one = names.length === 1;
  return `Couldn't move ${names.join(", ")} to the bin. ${one ? "It is" : "They are"} still where ${one ? "it was" : "they were"}.`;
};

export const newTrashBatchKey = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

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
  let earlier: string[] = [];
  return async (
    trash: (batchKey: string) => Promise<unknown>,
    find: (batchKeys: string[]) => Promise<string[]>,
  ): Promise<string[]> => {
    const batchKey = newTrashBatchKey();
    try {
      await trash(batchKey);
    } catch (error) {
      const refusal = willDeleteFilesRefusal(error);
      if (refusal) {
        if (refusal.batchId) earlier = [...earlier, refusal.batchId];
        refused(refusal.skipped);
      }
      throw error;
    }
    const batches = [...new Set([...earlier, ...(await find([batchKey]))])];
    earlier = [];
    return batches;
  };
}
