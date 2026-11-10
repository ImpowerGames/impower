import {
  Button,
  Dialog,
  DialogActions,
  DialogDescription,
  DialogTitle,
} from "@impower/impower-ui/components";
import { referencedByLabel } from "../../utils/fileListModel";
import { itemsLabel } from "../../workspace/scriptsListing";

export type DeleteDialogProps = {
  paths: readonly string[] | null;
  referencing: readonly string[] | null;
  onDelete: () => void;
  onClose: () => void;
};

export default function DeleteDialog({
  paths,
  referencing,
  onDelete,
  onClose,
}: DeleteDialogProps) {
  return (
    <Dialog open={!!paths} onOpenChange={(open) => !open && onClose()}>
      <DialogTitle>Delete {paths ? itemsLabel(paths) : ""}?</DialogTitle>
      <DialogDescription>
        {referencing
          ? referencedByLabel(referencing)
          : `Couldn't check which scripts reference ${paths?.length === 1 ? "it" : "them"}.`}
      </DialogDescription>
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
