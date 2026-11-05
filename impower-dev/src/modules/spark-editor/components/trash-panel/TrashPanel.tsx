import type { TrashBatch } from "@impower/spark-editor-protocol/src/types/workspace/TrashBatch";
import {
  ArrowBackUp,
  Button,
  Dialog,
  DialogActions,
  DialogTitle,
  Trash,
  X,
} from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { useEffect, useRef, useState } from "preact/hooks";
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

function batchLabel(batch: TrashBatch): string {
  if (batch.entries.length === 1) {
    const rel = batch.entries[0]!.relPath;
    return rel.split("/").pop() || rel;
  }
  return `${batch.entries.length} items`;
}

function batchLocation(batch: TrashBatch): string {
  const rel = batch.entries[0]?.relPath ?? "";
  const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
  if (batch.entries.length > 1) {
    const common = dir.split("/");
    for (const e of batch.entries) {
      const parts = (
        e.relPath.includes("/")
          ? e.relPath.slice(0, e.relPath.lastIndexOf("/"))
          : ""
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
  { kind: "batch"; batchId: string; label: string } | { kind: "empty" } | null;

export default function TrashPanel() {
  const open = useComputed(() => workspace.trashOpen.value).value;
  const [batches, setBatches] = useState<TrashBatch[] | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
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

  const restore = async (batchId: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const pid = workspace.signals.projectId.value;
      if (pid) {
        const { Workspace } = await import("../../workspace/Workspace");
        await Workspace.fs.restoreTrash(pid, batchId);
        await Workspace.window.recordScriptChange();
        await Workspace.window.recordAssetChange();
      }
    } catch {
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
    } finally {
      busyRef.current = false;
      setBusy(false);
      setConfirm(null);
    }
    await refresh();
  };

  const count = batches?.length ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && close()}
      onEscapeKeyDown={(event) => {
        if (confirm) {
          event.preventDefault();
          setConfirm(null);
        }
      }}
      size="lg"
      flush
      class="max-h-[80vh]"
    >
      <div class="flex flex-none flex-row items-center gap-2 px-4 py-3">
        <Trash class="size-5 flex-none text-foreground/70" />
        <DialogTitle class="min-w-0 flex-1 truncate">
          Recycle bin{count > 0 ? ` (${count})` : ""}
        </DialogTitle>
        {count > 0 && (
          <Button
            variant="quiet"
            onClick={() => setConfirm({ kind: "empty" })}
            disabled={busy}
          >
            Empty
          </Button>
        )}
        <Button
          variant="quiet"
          aria-label="Close"
          onClick={close}
          size="icon"
          class="flex-none text-muted"
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
                class="relative flex flex-row items-center gap-2 px-4 py-2 control-overlay"
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
                  variant="quiet"
                  aria-label="Restore"
                  title="Restore"
                  disabled={busy}
                  onClick={() => void restore(batch.batchId)}
                  size="icon"
                  class="flex-none text-muted"
                >
                  <ArrowBackUp class="size-4" />
                </Button>
                <Button
                  variant="quiet"
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
                  size="icon"
                  class="flex-none text-muted"
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
          <DialogActions>
            <Button
              variant="quiet"
              onClick={() => setConfirm(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                confirm.kind === "empty"
                  ? void empty()
                  : void deletePermanently(confirm.batchId)
              }
            >
              Delete
            </Button>
          </DialogActions>
        </div>
      )}
    </Dialog>
  );
}
