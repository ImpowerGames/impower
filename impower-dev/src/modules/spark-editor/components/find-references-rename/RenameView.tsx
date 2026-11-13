import { Button, TextField } from "@impower/impower-ui/components";
import { useRef } from "preact/hooks";
import workspaceSettings from "../../workspace/settings/WorkspaceSettings";
import { useScriptMode } from "../../workspace/useActiveEditor";
import { renameNote } from "../../workspace/WorkspaceSearch";
import workspace from "../../workspace/WorkspaceStore";
import { useFieldFocus } from "./findControls";
import { withSearch } from "./withSearch";

export default function RenameView() {
  const { subject, references, files, renameName, status, statusTone } =
    workspace.search.value;
  const autoRenameFiles = workspaceSettings.preferences.value.autoRenameFiles;
  const field = useRef<HTMLInputElement>(null);
  const reading = useScriptMode() === "reading";

  useFieldFocus(field, subject?.name);

  if (!subject) {
    return (
      <p class="m-0 px-6 py-1 text-[12px]/[1.5] text-muted">
        No name is under the caret.
      </p>
    );
  }

  const uses = references.reduce((n, g) => n + g.uses.length, 0);
  const error = !reading && statusTone === "error" && status;
  const line =
    (reading && "Tap Edit to rename.") ||
    error ||
    renameNote(subject, uses, references.length, autoRenameFiles ? files.length : 0);

  return (
    <form
      class="flex-none px-[14px] pt-0.5 pb-3 in-data-[layout=compact]:px-2.5"
      onSubmit={(event) => {
        event.preventDefault();
        withSearch((search) => search.rename());
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          withSearch((search) => search.dismiss());
        }
      }}
    >
      <label
        for="rename-new-name"
        class="mb-1.5 block text-[12px]/[1.5] font-semibold text-ink"
      >
        New name
      </label>
      <div class="flex items-center gap-2">
        <TextField
          ref={field}
          id="rename-new-name"
          width="full"
          class="flex-1"
          value={renameName}
          purpose="literal"
          aria-invalid={error ? "true" : undefined}
          aria-describedby="rename-status"
          onValueChange={(value) =>
            withSearch((search) => search.setRenameName(value))
          }
        />
        <Button type="submit" variant="primary" disabled={reading}>
          Rename
        </Button>
      </div>
      <p
        id="rename-status"
        role="status"
        data-tone={error ? "error" : "info"}
        class="m-0 mt-2 text-[12px]/[1.5] text-muted data-[tone=error]:text-error"
      >
        {line}
      </p>
    </form>
  );
}
