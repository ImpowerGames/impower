import { SparkLogo } from "@impower/impower-ui/components";
import { useLayout } from "@impower/impower-ui/layout";
import HeaderSyncToolbar from "../header-sync-toolbar/HeaderSyncToolbar";
import ImportProgressBar from "../import-progress-bar/ImportProgressBar";
import ProjectNameField from "./ProjectNameField";
import SaveStatusLine from "./SaveStatusLine";

export default function TopBar() {
  const compact = useLayout() === "compact";
  return (
    <header
      class="relative grid h-[76px] grid-cols-[var(--sidebar-width)_minmax(0,1fr)_auto] items-center border-b border-edge bg-bg pr-[26px] in-data-[layout=compact]:h-[54px] in-data-[layout=compact]:pr-[18px]"
    >
      <div class="flex min-w-0 items-center">
        <SparkLogo
          size={compact ? "sm" : "md"}
          class="ml-[27px] in-data-[layout=compact]:ml-[15px] group-data-[sidebar=collapsed]/sidebar:hidden"
        />
        <SparkLogo
          layout="mark"
          size={compact ? "sm" : "md"}
          class="mx-auto hidden group-data-[sidebar=collapsed]/sidebar:inline-flex"
        />
      </div>
      <div class="flex min-w-0 flex-col items-start gap-[1px] pl-[1px] -ml-[7px]">
        <ProjectNameField />
        <div class="pl-[7px]">
          <SaveStatusLine problems={compact} />
        </div>
      </div>
      <div class="flex items-center">
        <HeaderSyncToolbar />
      </div>
      <ImportProgressBar />
    </header>
  );
}
