import {
  Button,
  Dialog,
  DialogActions,
  DialogDescription,
  DialogTitle,
} from "@impower/impower-ui/components";
import type { ComponentChildren } from "preact";

export type DeleteDialogProps = {
  label: string | null;
  description: ComponentChildren;
  children?: ComponentChildren;
  onDelete: () => void;
  onClose: () => void;
};

export default function DeleteDialog({
  label,
  description,
  children,
  onDelete,
  onClose,
}: DeleteDialogProps) {
  return (
    <Dialog open={label !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogTitle>Delete {label ?? ""}?</DialogTitle>
      <DialogDescription>{description}</DialogDescription>
      {children}
      <DialogActions class="pt-4">
        <Button variant="quiet" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="destructive" onClick={onDelete}>
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
}
