import {
  Button,
  DedentIcon,
  FormatIcon,
  IndentIcon,
  PencilIcon,
  PlusIcon,
} from "@impower/impower-ui/components";
import { useLayout } from "@impower/impower-ui/layout";
import type { EditorCommand } from "@impower/spark-editor-protocol/src/protocols/editor/ExecuteEditorCommandMessage";
import { cn } from "../../../../../../packages/impower-ui/src/utils/cn";
import workspaceShortcuts from "../../workspace/shortcuts/WorkspaceShortcuts";
import {
  useCaretPosition,
  useScriptReadonly,
} from "../../workspace/useActiveEditor";
import { WritingTools } from "../writing-tools";

export type WriterBarProps = {
  filename?: string;
  canEdit?: boolean;
};

export default function WriterBar({
  filename = "main.sd",
  canEdit = true,
}: WriterBarProps) {
  const layout = useLayout();
  const desktop = layout === "desktop";
  const phone = layout === "phone";
  const scriptBusy = useScriptReadonly();
  const { line, column } = useCaretPosition(filename);

  const run = (command: EditorCommand) => {
    void import("../../workspace/Workspace").then(({ Workspace }) =>
      Workspace.window.executeEditorCommand(filename, command),
    );
  };

  const startEditing = () => {
    void import("../../workspace/Workspace").then(({ Workspace }) =>
      Workspace.window.startEditing(filename),
    );
  };

  return (
    <WritingTools filename={filename} canEdit={canEdit}>
      {(trigger) => (
        <div
          role="toolbar"
          aria-label="Writing"
          data-writer-bar
          class={cn(
            "flex flex-none items-center justify-between border-t border-edge bg-paper in-data-naming:hidden in-data-editing:hidden",
            desktop
              ? "grid h-[62px] min-h-[62px] grid-cols-[1fr_auto_1fr] gap-1 px-5"
              : "h-[52px] min-h-[52px] gap-0 px-1",
          )}
        >
          <div class="flex items-center gap-[3px] justify-self-start">
            {!desktop && !phone && (
              <>
                <div role="group" aria-label="Indentation" class="flex">
                  <Button
                    variant="quiet"
                    size="icon"
                    aria-label="Indent"
                    title={workspaceShortcuts.title("indent", "Indent")}
                    onClick={() => run("indent")}
                  >
                    <IndentIcon />
                  </Button>
                  <Button
                    variant="quiet"
                    size="icon"
                    aria-label="Dedent"
                    title={workspaceShortcuts.title("dedent", "Dedent")}
                    onClick={() => run("dedent")}
                  >
                    <DedentIcon />
                  </Button>
                </div>
                <Button
                  variant="quiet"
                  size="icon"
                  aria-label="Format script"
                  title={workspaceShortcuts.title("format", "Format script")}
                  onClick={() => run("format")}
                >
                  <FormatIcon />
                </Button>
              </>
            )}
            {trigger}
          </div>
          <Button
            variant="quiet"
            data-caret-position
            aria-live="off"
            title={workspaceShortcuts.title("gotoLine", "Go to line")}
            class="min-w-0 justify-self-center px-2 text-[11px] font-normal text-muted"
            onClick={() => run("gotoLine")}
          >
            Line {line}, Col {column}
          </Button>
          <div class="flex items-center justify-self-end">
            {phone ? (
              <Button
                size="pill"
                data-edit-script
                disabled={scriptBusy}
                onClick={startEditing}
              >
                <PencilIcon />
                Edit
              </Button>
            ) : (
              <span title="Adding scenes, branches and characters is coming soon">
                <Button disabled class="bg-transparent text-accent">
                  <PlusIcon />
                  Add
                </Button>
              </span>
            )}
          </div>
        </div>
      )}
    </WritingTools>
  );
}
