import { cn, SparkLogo, useSidebarCollapsed } from "@impower/impower-ui/components";
import { useLayout } from "@impower/impower-ui/layout";
import { SyncButton, SyncStatusLine } from "../drive-sync";
import ImportProgressBar from "../import-progress-bar/ImportProgressBar";
import StoryProblemCount from "./StoryProblemCount";
import TitleBarNameStatus from "./TitleBarNameStatus";
import TitleBarSearch from "./TitleBarSearch";

function CompactTopBar() {
  const collapsed = useSidebarCollapsed();
  return (
    <header class="hit-bound relative flex h-[var(--title-bar-height)] items-center border-b border-edge bg-bg pr-2.5">
      <span class={cn("flex w-[61px] flex-none items-center", collapsed ? "pl-[31px]" : "pl-5")}>
        <SparkLogo layout="mark" size="md" class="[&_svg]:w-6" />
      </span>
      <TitleBarNameStatus bands="coarse" class="flex-1" statusClass="fade-edge-over">
        <SyncStatusLine />
        <StoryProblemCount />
      </TitleBarNameStatus>
      <div class="flex flex-none items-center gap-[7px]">
        <SyncButton />
        {collapsed && <TitleBarSearch />}
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
      <TitleBarNameStatus
        bands="coarse"
        class="gap-[1px] pl-[1px] -ml-[7px] pointer-coarse:gap-0"
        statusClass="pl-1.5"
      >
        <SyncStatusLine />
      </TitleBarNameStatus>
      <div class="flex items-center">
        <SyncButton />
      </div>
      <ImportProgressBar />
    </header>
  );
}
