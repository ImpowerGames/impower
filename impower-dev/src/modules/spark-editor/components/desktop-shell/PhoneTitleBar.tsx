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
import { routeOfState } from "../../workspace/routes";
import workspace from "../../workspace/WorkspaceStore";
import { SyncButton, SyncStatusLine } from "../drive-sync";
import { openFind } from "../find-references-rename";
import { FoldedScriptHeader } from "../script-header";
import ImportProgressBar from "../import-progress-bar/ImportProgressBar";
import AppMenu from "./AppMenu";
import { finishNaming, useNaming } from "./naming";
import ProjectNameField from "./ProjectNameField";
import StoryProblemCount from "./StoryProblemCount";
import { withWindow } from "./workspaceWindow";

const searchStory = () =>
  void withWindow((win) => win.navigateTo("write")).then(openFind);

export default function PhoneTitleBar({ scrolled }: { scrolled: boolean }) {
  const namingField = useNaming();
  const script = useComputed(() => storyScriptOf()).value;
  const story = script !== undefined;
  const writing = useComputed(
    () => routeOfState(workspace.state.value) === "write",
  ).value;
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
        "hit-bound relative z-20 flex h-[var(--title-bar-height)] flex-none items-center border-b border-edge bg-bg",
        writing ? "pr-1 pl-2" : "gap-[7px] px-2.5",
        "motion-safe:transition-shadow motion-safe:duration-150",
        scrolled && "shadow-[0_7px_10px_-4px_var(--editor-sticky-shadow)]",
      )}
    >
      {editing ? (
        <FoldedScriptHeader filename={script!} />
      ) : (
        <>
          <span class="flex size-11 flex-none items-center justify-center">
            <SparkLogo layout="mark" size="md" class="[&_svg]:w-6" />
          </span>
          <div
            class={cn(
              "flex min-w-0 flex-1 flex-col items-start",
              writing && "ml-1",
            )}
          >
            <ProjectNameField />
            <div class="w-full min-w-0">
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
          onClick={finishNaming}
        >
          <CheckIcon />
          Done
        </Button>
      ) : (
        <div
          class={cn("flex flex-none items-center", !writing && "gap-[7px]")}
        >
          {!editing && <SyncButton />}
          <Button
            variant="quiet"
            size="icon"
            aria-label="Search"
            title="Search"
            class="text-muted"
            onClick={writing ? openFind : searchStory}
          >
            <SearchIcon />
          </Button>
          {editing && (
            <div role="group" aria-label="Edit history" class="mr-1 flex">
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
