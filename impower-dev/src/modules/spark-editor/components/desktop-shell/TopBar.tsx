import {
  Button,
  CheckIcon,
  cn,
  SparkLogo,
  useSidebarCollapsed,
} from "@impower/impower-ui/components";
import { useLayout } from "@impower/impower-ui/layout";
import { useComputed } from "@preact/signals";
import { storyScriptOf, useScriptMode } from "../../workspace/useActiveEditor";
import { SyncButton, SyncStatusLine } from "../drive-sync";
import ImportProgressBar from "../import-progress-bar/ImportProgressBar";
import { FoldedScriptHeader } from "../script-header";
import EditHistory from "./EditHistory";
import StoryProblemCount from "./StoryProblemCount";
import ProjectNameField from "./ProjectNameField";
import TitleBarSearch from "./TitleBarSearch";
import { withWindow } from "./workspaceWindow";

function CompactTopBar() {
  const collapsed = useSidebarCollapsed();
  const script = useComputed(() => storyScriptOf()).value;
  const editing = useScriptMode() === "editing" && script !== undefined;
  return (
    <header class="hit-bound relative flex h-[var(--title-bar-height)] items-center border-b border-edge bg-bg pr-2.5">
      <span class={cn("flex w-[61px] flex-none items-center", collapsed ? "pl-[31px]" : "pl-5")}>
        <SparkLogo layout="mark" size="md" class="[&_svg]:w-6" />
      </span>
      {editing && (
        <span
          data-title-divider
          aria-hidden="true"
          class={cn(
            "mr-1.5 h-6 w-px flex-none bg-edge",
            collapsed ? "ml-2" : "-ml-[3px]",
          )}
        />
      )}
      {editing ? (
        <FoldedScriptHeader filename={script!} />
      ) : (
        <div class="flex min-w-0 flex-1 flex-col items-start">
          <ProjectNameField />
          <div class="w-full min-w-0">
            <div class="z-[2] flex items-center fade-edge-over">
              <SyncStatusLine />
              <StoryProblemCount />
            </div>
          </div>
        </div>
      )}
      <div class="flex flex-none items-center gap-[7px]">
        {!editing && <SyncButton />}
        {collapsed && <TitleBarSearch />}
        {editing && (
          <>
            <EditHistory script={script!} />
            <Button
              size="pill"
              aria-label="Done editing"
              title="Done"
              onClick={() => void withWindow((win) => win.finishEditing())}
            >
              <CheckIcon />
              Done
            </Button>
          </>
        )}
      </div>
      <ImportProgressBar />
    </header>
  );
}

export default function TopBar() {
  if (useLayout() === "compact") {
    return <CompactTopBar />;
  }
  return (
    <header class="hit-bound relative grid h-[var(--title-bar-height)] grid-cols-[var(--sidebar-width)_minmax(0,1fr)_auto] items-center border-b border-edge bg-bg pr-[26px]">
      <div class="flex min-w-0 items-center">
        <SparkLogo size="md" class="ml-[27px] group-data-[sidebar=collapsed]/sidebar:hidden" />
        <SparkLogo
          layout="mark"
          size="md"
          class="mx-auto hidden group-data-[sidebar=collapsed]/sidebar:inline-flex"
        />
      </div>
      <div class="flex min-w-0 flex-col items-start gap-[1px] pl-[1px] -ml-[7px]">
        <ProjectNameField />
        <div class="flex items-center pl-1.5">
          <SyncStatusLine />
        </div>
      </div>
      <div class="flex items-center">
        <SyncButton />
      </div>
      <ImportProgressBar />
    </header>
  );
}
