import {
  ArrowDown,
  ArrowUp,
  Button,
  Dialog,
  DialogActions,
  DialogDescription,
  DialogTitle,
} from "@impower/impower-ui/components";
import { useState } from "preact/hooks";

export const propDefaults = {};
export type HeaderSyncConflictToolbarProps = Partial<typeof propDefaults>;

export default function HeaderSyncConflictToolbar(
  _p: HeaderSyncConflictToolbarProps,
) {
  const [pushOpen, setPushOpen] = useState(false);
  const [pullOpen, setPullOpen] = useState(false);

  const onConfirmPush = async () => {
    setPushOpen(false);
    const { Workspace } = await import("../../workspace/Workspace");
    await Workspace.window.resolveConflictWithPush();
  };
  const onConfirmPull = async () => {
    setPullOpen(false);
    const { Workspace } = await import("../../workspace/Workspace");
    await Workspace.window.resolveConflictWithPull();
  };

  return (
    <div class="flex flex-row items-center">
      <Button
        variant="quiet"
        class="size-14 flex-col gap-0.5 text-[10px] leading-none text-warning"
        aria-label="Push to remote"
        onClick={() => setPushOpen(true)}
      >
        <ArrowUp />
        PUSH
      </Button>
      <Button
        variant="quiet"
        class="size-14 flex-col gap-0.5 text-[10px] leading-none text-warning"
        aria-label="Pull from remote"
        onClick={() => setPullOpen(true)}
      >
        <ArrowDown />
        PULL
      </Button>

      <ConfirmDialog
        open={pushOpen}
        onClose={() => setPushOpen(false)}
        title="Push and overwrite remote file?"
        body="This will overwrite the remote file with your local changes."
        warning="(This action is irreversible!)"
        confirmLabel="Yes, overwrite remote file"
        onConfirm={onConfirmPush}
      />
      <ConfirmDialog
        open={pullOpen}
        onClose={() => setPullOpen(false)}
        title="Pull and overwrite local changes?"
        body="This will overwrite your local file changes with the contents of the remote project file."
        warning="(This action is irreversible!)"
        confirmLabel="Yes, overwrite my changes"
        onConfirm={onConfirmPull}
      />
    </div>
  );
}

function ConfirmDialog({
  open,
  onClose,
  title,
  body,
  warning,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  body: string;
  warning: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      size="md"
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription class="mt-3">
        {body}
      </DialogDescription>
      <div class="mt-1 text-sm text-muted">{warning}</div>
      <DialogActions class="mt-6">
        <Button variant="quiet" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
