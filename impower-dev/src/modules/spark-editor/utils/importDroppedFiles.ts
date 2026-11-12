import {
  beginUploadBatch,
  endUploadBatch,
  failUnfinished,
  projectReplacing,
  refuseUploads,
  startUploads,
  updateUpload,
  type UploadReason,
} from "../workspace/uploadSession";
import { reasonOf } from "./fileMoves";
import { recordResolvedUpload } from "./fileUndo";
import { runImport } from "./importProgress";
import { sameBytes } from "./sameBytes";
import { isScriptPath } from "./scriptFiles";
import { resolveUploadConflicts } from "./uploadConflicts";

export interface DroppedItem {
  rel: string;
  getBuffer: () => Promise<ArrayBuffer>;
}

const WRITE_CHUNK_FILES = 8;

const leafOf = (rel: string) => rel.slice(rel.lastIndexOf("/") + 1);

const BROWSER_NOT_FOUND = "A requested file or directory could not be found";

export const isMissingFile = (error: unknown, uri: string): boolean => {
  if ((error as { name?: unknown })?.name === "NotFoundError") {
    return true;
  }
  const message = reasonOf(error);
  return message === `${uri} was not found` || message.startsWith(BROWSER_NOT_FOUND);
};

const isStorageError = (error: unknown) =>
  (error as { name?: unknown })?.name === "QuotaExceededError" ||
  /quota|no space|not enough space|storage/i.test(reasonOf(error));

type Pending = { index: number; uri: string; replacing: boolean; data: ArrayBuffer };

export async function importFiles(projectId: string, items: DroppedItem[]): Promise<string[]> {
  const written: string[] = [];
  if (items.length === 0) {
    return written;
  }
  if (projectReplacing()) {
    refuseUploads(items.map((item) => leafOf(item.rel)), { kind: "replacing" });
    return written;
  }
  beginUploadBatch();
  try {
    const ids = startUploads(items.map((item) => leafOf(item.rel)));
    const { Workspace } = await import("../workspace/Workspace");
    const fs = Workspace.fs;
    const fail = (index: number, reason: UploadReason) => updateUpload(ids[index]!, { state: "failed", reason });
    const failedWrite = (pending: Pending, error: unknown): UploadReason => {
      const storage = isStorageError(error);
      return pending.replacing
        ? { kind: "replace_failed", cause: storage ? "storage" : "failed", message: storage ? undefined : reasonOf(error) }
        : storage
          ? { kind: "storage" }
          : { kind: "failed", message: reasonOf(error) };
    };
    try {
      await resolveUploadConflicts(
        projectId,
        items.map((item, index) => ({ rel: item.rel, payload: { item, index } })),
        async ({ survivors, trashedOldUris, since }) => {
          const surviving = new Set(survivors.map((s) => s.payload.index));
          items.forEach((_, index) => {
            if (!surviving.has(index)) {
              fail(index, { kind: "skipped" });
            }
          });
          const replaced = new Set(trashedOldUris);
          const landed: string[] = [];
          try {
            if (survivors.length > 0) {
              await runImport(survivors.length, async (advance) => {
                for (let at = 0; at < survivors.length; at += WRITE_CHUNK_FILES) {
                  const chunk: Pending[] = [];
                  for (const survivor of survivors.slice(at, at + WRITE_CHUNK_FILES)) {
                    const { index } = survivor.payload;
                    updateUpload(ids[index]!, { state: "working" });
                    try {
                      chunk.push({
                        index,
                        uri: survivor.uri,
                        replacing: replaced.has(survivor.uri),
                        data: await survivor.payload.item.getBuffer(),
                      });
                    } catch {
                      fail(index, { kind: "unreadable" });
                      advance();
                    }
                  }
                  const settle = (pending: Pending) => {
                    landed.push(pending.uri);
                    updateUpload(ids[pending.index]!, {
                      state: "added",
                      path: fs.getRelativePath(projectId, pending.uri),
                    });
                    advance();
                  };
                  try {
                    if (chunk.length) {
                      await fs.createFiles({
                        files: chunk.map((pending) => ({ uri: pending.uri, data: pending.data.slice(0) })),
                      });
                    }
                    chunk.forEach(settle);
                  } catch {
                    const holding = async (pending: Pending): Promise<"ours" | "other" | "none" | "unknown"> => {
                      let now: ArrayBuffer;
                      try {
                        now = await fs.readFile({ file: { uri: pending.uri } });
                      } catch (error) {
                        return isMissingFile(error, pending.uri) ? "none" : "unknown";
                      }
                      return sameBytes(now, pending.data) ? "ours" : "other";
                    };
                    const leave = (pending: Pending, held: "other" | "unknown") => {
                      fail(pending.index, { kind: held === "other" ? "left_as_is" : "unchecked" });
                      advance();
                    };
                    for (const pending of chunk) {
                      const before = await holding(pending);
                      if (before === "ours") {
                        settle(pending);
                        continue;
                      }
                      if (before !== "none") {
                        leave(pending, before);
                        continue;
                      }
                      try {
                        await fs.createFiles({ files: [{ uri: pending.uri, data: pending.data.slice(0) }] });
                        settle(pending);
                      } catch (error) {
                        const after = await holding(pending);
                        if (after === "ours") {
                          settle(pending);
                        } else if (after !== "none") {
                          leave(pending, after);
                        } else {
                          fail(pending.index, failedWrite(pending, error));
                          advance();
                        }
                      }
                    }
                  }
                }
              });
            }
          } finally {
            if (landed.length) {
              if (landed.some(isScriptPath)) {
                await Workspace.window.recordScriptChange();
              }
              await Workspace.window.recordAssetChange();
            }
            written.push(...landed.map((uri) => fs.getRelativePath(projectId, uri)));
            const label = landed.length === 1 ? (landed[0]!.split("/").pop() ?? "file") : `${landed.length} files`;
            await recordResolvedUpload(projectId, landed, trashedOldUris, since, label);
          }
        },
      );
    } catch (error) {
      failUnfinished(ids, { kind: "failed", message: reasonOf(error) });
      throw error;
    }
    return written;
  } finally {
    endUploadBatch();
  }
}
