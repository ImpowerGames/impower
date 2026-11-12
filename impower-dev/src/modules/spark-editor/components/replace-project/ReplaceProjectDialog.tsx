import {
  Button,
  Dialog,
  DialogActions,
  DialogDescription,
  DialogTitle,
} from "@impower/impower-ui/components";
import { plural } from "../../utils/fileListModel";
import { useEffect } from "preact/hooks";
import { replaceProjectSummary } from "../../workspace/replaceProject";
import { writingCount } from "../../workspace/uploadSession";
import workspace from "../../workspace/WorkspaceStore";

const withWindow = async (
  act: (
    win: (typeof import("../../workspace/Workspace"))["Workspace"]["window"],
  ) => unknown,
) => {
  const { Workspace } = await import("../../workspace/Workspace");
  await act(Workspace.window);
};

export default function ReplaceProjectDialog() {
  const request = workspace.replaceProject.value;
  const adding = writingCount(workspace.uploads.value);
  const writing = adding > 0 || workspace.uploadBatches.value > 0;
  const replacing = workspace.replacing.value;

  useEffect(() => {
    if (!writing && workspace.replaceProject.peek()) {
      void withWindow((win) => win.refreshProjectReplace());
    }
  }, [writing]);

  const cancel = () => void withWindow((win) => win.cancelProjectReplace());

  return (
    <Dialog
      open={!!request}
      onOpenChange={(next) => {
        if (!next) {
          cancel();
        }
      }}
      size="lg"
      responsive
    >
      <DialogTitle>Replace this project?</DialogTitle>
      <DialogDescription class="mt-3">
        {request ? replaceProjectSummary(request) : null}
      </DialogDescription>
      <p class="mt-3 mb-0 text-sm text-ink">
        To keep what you have, download a backup first.
      </p>
      {(writing || replacing) && (
        <p class="mt-3 mb-0 text-sm text-muted" data-replace-waiting>
          {replacing
            ? "Wait for the project being replaced to finish, then replace it again."
            : adding > 0
              ? `Wait for the ${plural(adding, "file")} still being added, then replace the project.`
              : "Wait for the upload to finish, then replace the project."}
        </p>
      )}
      <DialogActions class="mt-6 flex-wrap">
        <Button variant="quiet" onClick={cancel}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          disabled={writing || replacing}
          onClick={() => void withWindow((win) => win.confirmProjectReplace())}
        >
          Replace project
        </Button>
      </DialogActions>
    </Dialog>
  );
}
