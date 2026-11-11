import type { TrashBatch } from "@impower/spark-editor-protocol/src/types/workspace/TrashBatch";
import {
  Button,
  CloseIcon,
  Dialog,
  DialogActions,
  DialogTitle,
  FileIcon,
  FolderIcon,
  ListRow,
  TrashIcon,
  UndoIcon,
} from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { useEffect, useRef, useState } from "preact/hooks";
import workspace from "../../workspace/WorkspaceStore";
import { imageStacks } from "../../utils/imageStacks";
import { showSnackbar } from "../../utils/snackbar";

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

function topFolders(batch: TrashBatch): string[] {
  const folders = batch.folders ?? [];
  return folders.filter(
    (f) => !folders.some((other) => other !== f && f.startsWith(`${other}/`)),
  );
}

function onePicture(batch: TrashBatch): string | null {
  if (batch.folders?.length || batch.entries.length < 2 || batch.entries.some((e) => e.type !== "image")) {
    return null;
  }
  const stacks = imageStacks(batch.entries.map((e) => e.relPath));
  return stacks.length === 1 ? stacks[0]!.name : null;
}

function batchLabel(batch: TrashBatch): string {
  const picture = onePicture(batch);
  if (picture) {
    return picture;
  }
  const tops = topFolders(batch);
  const loose = batch.entries.filter(
    (e) => !tops.some((t) => e.relPath.startsWith(`${t}/`)),
  );
  const [only] = [...tops, ...loose.map((e) => e.relPath)];
  if (only && tops.length + loose.length === 1) {
    return only.split("/").pop() || only;
  }
  return `${tops.length + loose.length} items`;
}

function batchLocation(batch: TrashBatch): string {
  const [top, ...others] = topFolders(batch);
  if (top && others.length === 0) {
    return top.includes("/") ? top.slice(0, top.lastIndexOf("/")) : "";
  }
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

  const restore = async (batch: TrashBatch) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const pid = workspace.signals.projectId.value;
      if (pid) {
        const { Workspace } = await import("../../workspace/Workspace");
        await Workspace.fs.restoreTrash(pid, batch.batchId);
        await Workspace.window.recordScriptChange();
        await Workspace.window.recordAssetChange();
      }
    } catch (error) {
      console.error(error);
      showSnackbar({ message: `Couldn't restore ${batchLabel(batch)}.` });
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
        <TrashIcon class="size-5 flex-none text-foreground/70" />
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
          <CloseIcon class="size-4" />
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
              <ListRow
                key={batch.batchId}
                class="px-2"
                icon={(batch.entries.length === 1 && !batch.folders?.length) || onePicture(batch) ? <FileIcon /> : <FolderIcon />}
                label={batchLabel(batch)}
                description={`${loc ? `${loc} · ` : ""}${timeAgo(batch.deletedAt)}`}
                actions={
                  <>
                    <Button
                      variant="quiet"
                      aria-label="Restore"
                      title="Restore"
                      disabled={busy}
                      onClick={() => void restore(batch)}
                      size="icon"
                      class="flex-none text-muted"
                    >
                      <UndoIcon class="size-4" />
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
                      <TrashIcon class="size-4" />
                    </Button>
                  </>
                }
              />
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
