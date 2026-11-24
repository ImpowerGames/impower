import { Button, RedoIcon, UndoIcon } from "@impower/impower-ui/components";
import type { EditorCommand } from "@impower/spark-editor-protocol/src/protocols/editor/ExecuteEditorCommandMessage";
import { useEditorHistory } from "../../workspace/useActiveEditor";
import { withWindow } from "./workspaceWindow";

export default function EditHistory({ script }: { script: string }) {
  const { canUndo, canRedo } = useEditorHistory(script);
  const run = (command: EditorCommand) =>
    void withWindow((win) => win.executeEditorCommand(script, command));
  return (
    <div role="group" aria-label="Edit history" class="flex">
      <Button
        variant="quiet"
        size="icon"
        aria-label="Undo edit"
        title="Undo"
        class="text-muted"
        disabled={!canUndo}
        onClick={() => run("undo")}
      >
        <UndoIcon />
      </Button>
      <Button
        variant="quiet"
        size="icon"
        aria-label="Redo edit"
        title="Redo"
        class="text-muted"
        disabled={!canRedo}
        onClick={() => run("redo")}
      >
        <RedoIcon />
      </Button>
    </div>
  );
}
