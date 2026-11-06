import {
  Button,
  CheckIcon,
  FollowIcon,
  RedoIcon,
  SearchIcon,
  SparkLogo,
  UndoIcon,
} from "@impower/impower-ui/components";
import type { EditorCommand } from "@impower/spark-editor-protocol/src/protocols/editor/ExecuteEditorCommandMessage";
import { useComputed } from "@preact/signals";
import { cn } from "../../../../../../packages/impower-ui/src/utils/cn";
import {
  storyScriptOf,
  useEditorHistory,
} from "../../workspace/useActiveEditor";
import { SyncButton, SyncStatusLine } from "../drive-sync";
import ImportProgressBar from "../import-progress-bar/ImportProgressBar";
import AppMenu from "./AppMenu";
import { finishNaming, useNaming } from "./naming";
import ProjectNameField from "./ProjectNameField";
import StoryProblemCount from "./StoryProblemCount";
import { withWindow } from "./workspaceWindow";

export default function PhoneTitleBar({ scrolled }: { scrolled: boolean }) {
  const naming = useNaming() === "project";
  const script = useComputed(() => storyScriptOf()).value;
  const story = script !== undefined;
  const { canUndo, canRedo } = useEditorHistory(script);

  const run = (command: EditorCommand) =>
    void withWindow((win) => win.executeEditorCommand(script!, command));

  return (
    <header
      data-phone-title-bar
      class={cn(
        "relative z-20 flex h-[54px] flex-none items-center gap-[7px] border-b border-edge bg-bg pr-1 pl-2.5",
        "motion-safe:transition-shadow motion-safe:duration-150",
        scrolled && "shadow-[0_7px_10px_-4px_var(--editor-sticky-shadow)]",
      )}
    >
      <SparkLogo layout="mark" size="md" class="flex-none" />
      <div class="flex min-w-0 flex-1 flex-col items-start -ml-1.5">
        <ProjectNameField />
        <div class="pl-1.5">
          <div class="flex items-center">
            <SyncStatusLine />
            <StoryProblemCount />
          </div>
        </div>
      </div>
      {naming ? (
        <Button
          variant="primary"
          aria-label="Keep the name"
          class="mr-2.5 min-h-9 gap-1.5 px-3.5 [&_svg]:size-4"
          onClick={finishNaming}
        >
          <CheckIcon />
          Done
        </Button>
      ) : (
        <div class="flex flex-none items-center">
          <SyncButton />
          {story && (
            <Button
              variant="quiet"
              size="icon"
              aria-label="Search"
              title="Search"
              class="text-muted"
              onClick={() => run("search")}
            >
              <SearchIcon />
            </Button>
          )}
          {story && (
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
          )}
          {story && (
            <Button
              variant="quiet"
              size="icon"
              aria-label="Show the preview"
              title="Show the preview"
              class="text-muted"
              onClick={() => void withWindow((win) => win.expandPreviewPane())}
            >
              <FollowIcon />
            </Button>
          )}
          <AppMenu trigger="bar" />
        </div>
      )}
      <ImportProgressBar />
    </header>
  );
}
