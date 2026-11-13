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
import { isScriptPath } from "./scriptFiles";
import { resolveUploadConflicts } from "./uploadConflicts";

export interface DroppedItem {
  rel: string;
  getBuffer: () => Promise<ArrayBuffer>;
  address?: string;
}

const leafOf = (rel: string) => rel.slice(rel.lastIndexOf("/") + 1);

const isStorageError = (error: unknown) =>
  (error as { name?: unknown })?.name === "QuotaExceededError" ||
  /quota|no space|not enough space|storage/i.test(reasonOf(error));

type Pending = { index: number; uri: string; replacing: boolean };

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
        items.map((item, index) => ({ rel: item.rel, address: item.address, payload: { item, index } })),
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
                for (const survivor of survivors) {
                  const pending: Pending = {
                    index: survivor.payload.index,
                    uri: survivor.uri,
                    replacing: replaced.has(survivor.uri),
                  };
                  updateUpload(ids[pending.index]!, { state: "working" });
                  let data: ArrayBuffer;
                  try {
                    data = await survivor.payload.item.getBuffer();
                  } catch {
                    fail(pending.index, { kind: "unreadable" });
                    advance();
                    continue;
                  }
                  try {
                    await fs.createFiles({ files: [{ uri: pending.uri, data }] });
                    landed.push(pending.uri);
                    updateUpload(ids[pending.index]!, { state: "added", path: fs.getRelativePath(projectId, pending.uri) });
                  } catch (error) {
                    fail(pending.index, failedWrite(pending, error));
                  }
                  advance();
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
