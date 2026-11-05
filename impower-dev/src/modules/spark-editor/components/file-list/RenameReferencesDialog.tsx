import {
  Button,
  Dialog,
  DialogActions,
  DialogDescription,
  DialogTitle,
  PencilIcon,
} from "@impower/impower-ui/components";

export type RenameReferencesDialogProps = {
  open: boolean;
  returnFocus?: () => HTMLElement | null;
  fromName: string;
  toName: string;
  referenceCount: number;
  scriptCount: number;
  onUpdateAndRename: () => void;
  onRenameOnly: () => void;
  onCancel: () => void;
};

export default function RenameReferencesDialog({
  open,
  returnFocus,
  fromName,
  toName,
  referenceCount,
  scriptCount,
  onUpdateAndRename,
  onRenameOnly,
  onCancel,
}: RenameReferencesDialogProps) {
  const refs = `${referenceCount} reference${referenceCount === 1 ? "" : "s"}`;
  const scripts = `${scriptCount} script${scriptCount === 1 ? "" : "s"}`;

  return (
    <Dialog
      open={open}
      returnFocus={returnFocus}
      onOpenChange={(next) => !next && onCancel()}
    >
      <div class="mb-3 flex flex-row items-center gap-2">
        <PencilIcon class="size-5 text-foreground/70" />
        <DialogTitle class="flex-1">Update references?</DialogTitle>
      </div>
      <DialogDescription class="mb-5">
        <span class="font-medium text-foreground">{fromName}</span> is used in{" "}
        {scripts} ({refs}). Rename it to{" "}
        <span class="font-medium text-foreground">{toName}</span> and update{" "}
        {referenceCount === 1 ? "it" : "them"}?
      </DialogDescription>
      <DialogActions>
        <Button
          variant="quiet"
          onClick={onRenameOnly}
        >
          Rename only
        </Button>
        <Button
          variant="primary"
          onClick={onUpdateAndRename}
        >
          Update &amp; rename
        </Button>
      </DialogActions>
    </Dialog>
  );
}
