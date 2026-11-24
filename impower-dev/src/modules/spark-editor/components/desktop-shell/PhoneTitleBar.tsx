import { Button, CheckIcon, SparkLogo } from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { cn } from "@impower/impower-ui/components";
import { storyScriptOf, useScriptMode } from "../../workspace/useActiveEditor";
import { SyncButton, SyncStatusLine } from "../drive-sync";
import { FoldedScriptHeader } from "../script-header";
import ImportProgressBar from "../import-progress-bar/ImportProgressBar";
import AppMenu from "./AppMenu";
import EditHistory from "./EditHistory";
import { finishNaming, useNaming } from "./naming";
import ProjectNameField from "./ProjectNameField";
import StoryProblemCount from "./StoryProblemCount";
import TitleBarSearch from "./TitleBarSearch";
import { withWindow } from "./workspaceWindow";

export default function PhoneTitleBar({ scrolled }: { scrolled: boolean }) {
  const namingField = useNaming();
  const script = useComputed(() => storyScriptOf()).value;
  const story = script !== undefined;
  const editing = useScriptMode() === "editing" && story;
  const naming =
    namingField === "project" || (namingField === "script" && editing);

  return (
    <header
      data-phone-title-bar
      class={cn(
        "hit-bound relative z-20 flex h-[var(--title-bar-height)] flex-none items-center gap-[7px] border-b border-edge bg-bg px-2.5",
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
          <div class="flex min-w-0 flex-1 flex-col items-start">
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
        <div class="flex flex-none items-center gap-[7px]">
          {!editing && <SyncButton />}
          {editing && <EditHistory script={script!} />}
          <TitleBarSearch />
          {editing ? (
            <Button
              size="pill"
              aria-label="Done editing"
              title="Done"
              class="w-11 px-0"
              onClick={() => void withWindow((win) => win.finishEditing())}
            >
              <CheckIcon />
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
