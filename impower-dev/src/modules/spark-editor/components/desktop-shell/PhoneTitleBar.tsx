import {
  Button,
  CheckIcon,
  RedoIcon,
  SearchIcon,
  SparkLogo,
  UndoIcon,
} from "@impower/impower-ui/components";
import type { EditorCommand } from "@impower/spark-editor-protocol/src/protocols/editor/ExecuteEditorCommandMessage";
import { useComputed } from "@preact/signals";
import { cn } from "@impower/impower-ui/components";
import {
  storyScriptOf,
  useEditorHistory,
  useScriptMode,
} from "../../workspace/useActiveEditor";
import { SyncButton, SyncStatusLine } from "../drive-sync";
import { openFind } from "../find-references-rename";
import { FoldedScriptHeader } from "../script-header";
import ImportProgressBar from "../import-progress-bar/ImportProgressBar";
import AppMenu from "./AppMenu";
import { finishNaming, useNaming } from "./naming";
import ProjectNameField from "./ProjectNameField";
import StoryProblemCount from "./StoryProblemCount";
import { withWindow } from "./workspaceWindow";

export default function PhoneTitleBar({ scrolled }: { scrolled: boolean }) {
  const namingField = useNaming();
  const script = useComputed(() => storyScriptOf()).value;
  const story = script !== undefined;
  const editing = useScriptMode() === "editing" && story;
  const naming =
    namingField === "project" || (namingField === "script" && editing);
  const { canUndo, canRedo } = useEditorHistory(script);

  const run = (command: EditorCommand) =>
    void withWindow((win) => win.executeEditorCommand(script!, command));

  return (
    <header
      data-phone-title-bar
      class={cn(
        "hit-bound relative z-20 flex h-[54px] flex-none items-center border-b border-edge bg-bg pr-1 pl-2.5",
        !editing && "gap-[7px]",
        "motion-safe:transition-shadow motion-safe:duration-150",
        scrolled && "shadow-[0_7px_10px_-4px_var(--editor-sticky-shadow)]",
      )}
    >
      {editing ? (
        <FoldedScriptHeader filename={script!} />
      ) : (
        <>
          <SparkLogo layout="mark" size="md" class="flex-none" />
          <div class="flex min-w-0 flex-1 flex-col items-start -ml-1.5">
            <ProjectNameField />
            <div class="w-full min-w-0 pl-1.5">
              <div class="z-[2] flex items-center fade-edge-over">
                <SyncStatusLine />
                <StoryProblemCount />
              </div>
            </div>
          </div>
        </>
      )}
      {naming ? (
        <Button
          size="pill"
          aria-label="Keep the name"
          class="mr-1"
          onClick={finishNaming}
        >
          <CheckIcon />
          Done
        </Button>
      ) : (
        <div class="flex flex-none items-center">
          {!editing && <SyncButton />}
          {story && (
            <Button
              variant="quiet"
              size="icon"
              aria-label="Search"
              title="Search"
              class="text-muted"
              onClick={openFind}
            >
              <SearchIcon />
            </Button>
          )}
          {editing && (
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
          {editing ? (
            <Button
              size="pill"
              aria-label="Done editing"
              class="mr-1"
              onClick={() => void withWindow((win) => win.finishEditing())}
            >
              <CheckIcon />
              Done
            </Button>
          ) : (
            <AppMenu trigger="bar" />
          )}
        </div>
      )}
      <ImportProgressBar />
    </header>
  );
}
