import { ArrowDown, ArrowUp, Button } from "@impower/impower-ui/components";
import { useEffect, useState } from "preact/hooks";

export const propDefaults = {};
export type HeaderSyncConflictToolbarProps = Partial<typeof propDefaults>;

/**
 * Conflict-resolution toolbar shown in the top header when
 * `sync.status === "sync_conflict"`. Two columnar buttons (PUSH / PULL)
 * each open a confirm dialog warning that the action is irreversible.
 *
 * Replaces the legacy `<se-header-sync-conflict-toolbar>` (sparkle
 * `<s-button>` + `<s-dialog>`). The dialog is a plain Preact-native
 * modal (no Radix dependency, which had CJS-during-Vite-SSR issues for
 * `react-dialog`'s portal helper). Animated SVG decorations from the
 * spec have been simplified to a single arrow icon next to the
 * heading — the imperative SVG animations from the spec were
 * impressive but not essential to the action.
 */
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
        variant="ghost"
        class="size-14 flex flex-col items-center justify-center gap-0.5 text-[var(--color-amber-300)] text-[10px] leading-none"
        aria-label="Push to remote"
        onClick={() => setPushOpen(true)}
      >
        <ArrowUp class="size-5" />
        PUSH
      </Button>
      <Button
        variant="ghost"
        class="size-14 flex flex-col items-center justify-center gap-0.5 text-[var(--color-amber-300)] text-[10px] leading-none"
        aria-label="Pull from remote"
        onClick={() => setPullOpen(true)}
      >
        <ArrowDown class="size-5" />
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

/**
 * Plain Preact-native modal. Only renders when `open`. Overlay click
 * and Escape both call `onClose`. Confirm button calls `onConfirm`.
 *
 * No Radix dependency on purpose — the impower-dev SSR module loader
 * crashes on `@radix-ui/react-dialog`'s CJS portal helpers.
 */
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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dlg-title"
        class="w-[90vw] max-w-md rounded-lg bg-popup p-6 shadow-xl"
      >
        <h2 id="dlg-title" class="text-lg font-medium text-foreground">
          {title}
        </h2>
        <p class="mt-3 text-sm text-foreground/80">{body}</p>
        <div class="mt-1 text-sm text-foreground/60">{warning}</div>
        <div class="mt-6 flex flex-row justify-end gap-2">
          <Button variant="ghost" class="px-4" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" class="px-4" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
