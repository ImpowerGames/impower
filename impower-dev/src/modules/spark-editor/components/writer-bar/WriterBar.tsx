import {
  Button,
  DedentIcon,
  DropdownContent,
  DropdownItem,
  DropdownRoot,
  DropdownTrigger,
  FormatIcon,
  IndentIcon,
  MoreIcon,
  PlusIcon,
} from "@impower/impower-ui/components";
import { useLayout } from "@impower/impower-ui/layout";
import type { EditorCommand } from "@impower/spark-editor-protocol/src/protocols/editor/ExecuteEditorCommandMessage";
import { cn } from "../../../../../../packages/impower-ui/src/utils/cn";
import { useCaretPosition } from "../../workspace/useActiveEditor";

export type WriterBarProps = {
  filename?: string;
};

export default function WriterBar({ filename = "main.sd" }: WriterBarProps) {
  const layout = useLayout();
  const desktop = layout === "desktop";
  const { line, column } = useCaretPosition(filename);

  const run = (command: EditorCommand) => {
    void import("../../workspace/Workspace").then(({ Workspace }) =>
      Workspace.window.executeEditorCommand(filename, command),
    );
  };

  return (
    <div
      role="toolbar"
      aria-label="Writing"
      data-writer-bar
      class={cn(
        "flex flex-none items-center justify-between border-t border-edge bg-paper",
        desktop
          ? "grid h-[62px] min-h-[62px] grid-cols-[1fr_auto_1fr] gap-1 px-5"
          : "h-[52px] min-h-[52px] gap-0 px-1",
      )}
    >
      <div class="flex items-center gap-[3px] justify-self-start">
        {!desktop && (
          <>
            <div role="group" aria-label="Indentation" class="flex">
              <Button
                variant="quiet"
                size="icon"
                aria-label="Indent"
                title="Indent"
                onClick={() => run("indent")}
              >
                <IndentIcon />
              </Button>
              <Button
                variant="quiet"
                size="icon"
                aria-label="Dedent"
                title="Dedent"
                onClick={() => run("dedent")}
              >
                <DedentIcon />
              </Button>
            </div>
            <Button
              variant="quiet"
              size="icon"
              aria-label="Format script"
              title="Format script"
              onClick={() => run("format")}
            >
              <FormatIcon />
            </Button>
          </>
        )}
        <DropdownRoot>
          <DropdownTrigger asChild>
            <Button
              variant="quiet"
              size="icon"
              aria-label="Writing tools"
              title="Writing tools"
            >
              <MoreIcon />
            </Button>
          </DropdownTrigger>
          <DropdownContent side="top" align="start">
            <DropdownItem onSelect={() => run("search")}>
              Find and replace
            </DropdownItem>
            <DropdownItem onSelect={() => run("gotoLine")}>
              Go to line
            </DropdownItem>
            <DropdownItem onSelect={() => run("format")}>
              Format script
            </DropdownItem>
          </DropdownContent>
        </DropdownRoot>
      </div>
      <Button
        variant="quiet"
        data-caret-position
        aria-live="off"
        title="Go to line"
        class="min-w-0 justify-self-center px-2 text-[11px] font-normal text-muted"
        onClick={() => run("gotoLine")}
      >
        Line {line}, Col {column}
      </Button>
      <div class="flex items-center justify-self-end">
        <span title="Adding scenes, branches and characters is coming soon">
          <Button disabled class="bg-transparent text-accent">
            <PlusIcon />
            Add
          </Button>
        </span>
      </div>
    </div>
  );
}
