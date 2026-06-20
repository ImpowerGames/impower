import type { TrashBatch } from "@impower/spark-editor-protocol/src/types/workspace/TrashBatch";
import {
  ArrowBackUp,
  Button,
  Trash,
  X,
} from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { createPortal } from "preact/compat";
import { useEffect, useRef, useState } from "preact/hooks";
import { useMountTransition } from "../../hooks/useMountTransition";
import workspace from "../../workspace/WorkspaceStore";

function timeAgo(ms: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

// A single-file delete shows the file name; a folder/multi delete shows a count.
function batchLabel(batch: TrashBatch): string {
  if (batch.entries.length === 1) {
    const rel = batch.entries[0]!.relPath;
    return rel.split("/").pop() || rel;
  }
  return `${batch.entries.length} items`;
}

// The common parent folder of a batch's entries (blank = project root).
function batchLocation(batch: TrashBatch): string {
  const rel = batch.entries[0]?.relPath ?? "";
  const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
  // For a multi-item batch, walk up to the shared prefix.
  if (batch.entries.length > 1) {
    const common = dir.split("/");
    for (const e of batch.entries) {
      const parts = (
        e.relPath.includes("/") ? e.relPath.slice(0, e.relPath.lastIndexOf("/")) : ""
      ).split("/");
      let i = 0;
      while (i < common.length && common[i] === parts[i]) i++;
      common.length = i;
    }
    return common.join("/");
  }
  return dir;
}

type Confirm =
  | { kind: "batch"; batchId: string; label: string }
  | { kind: "empty" }
  | null;

/**
 * Project-wide recycle bin. Lists every trash batch (one delete action each,
 * newest first) with Restore + Delete-permanently, plus an Empty action.
 * Driven by the global `workspace.trashOpen` signal; portaled to <body>.
 */
export default function TrashPanel() {
  const open = useComputed(() => workspace.trashOpen.value).value;
  const { mounted, visible } = useMountTransition(open, 200);
  const [batches, setBatches] = useState<TrashBatch[] | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  // Synchronous latch — `busy` only disables the buttons after a re-render, so
  // a fast double-tap could fire a worker op twice before that lands.
  const busyRef = useRef(false);

  const close = () => {
    workspace.trashOpen.value = false;
  };

  const refresh = async () => {
    const pid = workspace.signals.projectId.value;
    if (!pid) {
      setBatches([]);
      return;
    }
    const { Workspace } = await import("../../workspace/Workspace");
    setBatches(await Workspace.fs.listTrash(pid));
  };

  useEffect(() => {
    if (open) {
      setBatches(null);
      setConfirm(null);
      void refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (confirm) setConfirm(null);
        else close();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, confirm]);

  const restore = async (batchId: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const pid = workspace.signals.projectId.value;
      if (pid) {
        const { Workspace } = await import("../../workspace/Workspace");
        await Workspace.fs.restoreTrash(pid, batchId);
        // The restored files re-enter the project — mark it dirty for sync.
        await Workspace.window.recordScriptChange();
        await Workspace.window.recordAssetChange();
      }
    } catch {
      // A lost race (batch already gone) is fine — the list just refreshes.
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
    await refresh();
  };

  const deletePermanently = async (batchId: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const pid = workspace.signals.projectId.value;
      if (pid) {
        const { Workspace } = await import("../../workspace/Workspace");
        await Workspace.fs.deleteTrashBatch(pid, batchId);
      }
    } catch {
      // ignore — refresh below reflects the real state
    } finally {
      busyRef.current = false;
      setBusy(false);
      setConfirm(null);
    }
    await refresh();
  };

  const empty = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const pid = workspace.signals.projectId.value;
      if (pid) {
        const { Workspace } = await import("../../workspace/Workspace");
        await Workspace.fs.emptyTrash(pid);
      }
    } catch {
      // ignore — refresh below reflects the real state
    } finally {
      busyRef.current = false;
      setBusy(false);
      setConfirm(null);
    }
    await refresh();
  };

  if (!mounted || typeof document === "undefined") {
    return null;
  }

  const count = batches?.length ?? 0;

  return createPortal(
    <div
      class={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 transition-opacity duration-200 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      onClick={close}
      role="presentation"
    >
      <div
        class={`flex max-h-[80vh] w-full max-w-lg select-none flex-col overflow-hidden rounded-lg bg-engine-800 text-foreground shadow-2xl ring-1 ring-foreground/10 transition-all duration-200 ease-out ${
          visible ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Recycle bin"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="flex flex-none flex-row items-center gap-2 px-4 py-3">
          <Trash class="size-5 flex-none text-foreground/70" />
          <h2 class="min-w-0 flex-1 truncate text-base font-semibold">
            Recycle bin{count > 0 ? ` (${count})` : ""}
          </h2>
          {count > 0 && (
            <Button
              variant="ghost"
              onClick={() => setConfirm({ kind: "empty" })}
              disabled={busy}
              class="h-8 rounded px-3 text-sm font-normal text-foreground/70 hover:text-foreground"
            >
              Empty
            </Button>
          )}
          <Button
            variant="ghost"
            aria-label="Close"
            onClick={close}
            class="size-7 flex-none rounded-full p-0 text-foreground/60 hover:bg-foreground/10 hover:text-foreground"
          >
            <X class="size-4" />
          </Button>
        </div>

        {batches == null ? (
          <div class="px-4 pb-5 text-sm text-foreground/50">Loading…</div>
        ) : count === 0 ? (
          <div class="px-4 pb-6 pt-2 text-sm text-foreground/60">
            Recycle bin is empty. Deleted files are kept here for 30 days.
          </div>
        ) : (
          <div class="min-h-0 flex-1 overflow-y-auto pb-2">
            {batches!.map((batch) => {
              const loc = batchLocation(batch);
              return (
                <div
                  key={batch.batchId}
                  class="flex flex-row items-center gap-2 px-4 py-2 hover:bg-foreground/5"
                >
                  <div class="flex min-w-0 flex-1 flex-col">
                    <span class="truncate text-sm font-medium">
                      {batchLabel(batch)}
                    </span>
                    <span class="truncate text-xs text-foreground/50">
                      {loc ? `${loc} · ` : ""}
                      {timeAgo(batch.deletedAt)}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    aria-label="Restore"
                    title="Restore"
                    disabled={busy}
                    onClick={() => void restore(batch.batchId)}
                    class="size-8 flex-none rounded-full p-0 text-foreground/60 hover:bg-foreground/10 hover:text-foreground"
                  >
                    <ArrowBackUp class="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label="Delete permanently"
                    title="Delete permanently"
                    disabled={busy}
                    onClick={() =>
                      setConfirm({
                        kind: "batch",
                        batchId: batch.batchId,
                        label: batchLabel(batch),
                      })
                    }
                    class="size-8 flex-none rounded-full p-0 text-foreground/60 hover:bg-danger-500/15 hover:text-danger-500"
                  >
                    <Trash class="size-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {confirm && (
          <div class="flex flex-none flex-col gap-3 border-t border-foreground/10 px-4 py-3">
            <p class="text-sm text-foreground/80">
              {confirm.kind === "empty"
                ? "Permanently delete everything in the recycle bin? This can't be undone."
                : `Permanently delete “${confirm.label}”? This can't be undone.`}
            </p>
            <div class="flex flex-row justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setConfirm(null)}
                disabled={busy}
                class="h-9 px-3 text-sm font-normal text-foreground/70 hover:text-foreground"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() =>
                  confirm.kind === "empty"
                    ? void empty()
                    : void deletePermanently(confirm.batchId)
                }
                class="h-9 bg-danger-500 px-4 text-sm font-normal hover:bg-danger-500/90"
              >
                Delete
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
