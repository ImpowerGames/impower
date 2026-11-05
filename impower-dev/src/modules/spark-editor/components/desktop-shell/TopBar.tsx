import { SparkLogo } from "@impower/impower-ui/components";
import { SyncButton, SyncStatusLine } from "../drive-sync";
import ImportProgressBar from "../import-progress-bar/ImportProgressBar";
import ProjectNameField from "./ProjectNameField";

export default function TopBar() {
  return (
    <header class="relative grid h-[76px] grid-cols-[var(--sidebar-width)_minmax(0,1fr)_auto] items-center border-b border-edge bg-bg pr-[26px]">
      <div class="flex min-w-0 items-center">
        <SparkLogo class="ml-[27px] group-data-[sidebar=collapsed]/sidebar:hidden" />
        <SparkLogo
          layout="mark"
          class="mx-auto hidden group-data-[sidebar=collapsed]/sidebar:inline-flex"
        />
      </div>
      <div class="flex min-w-0 flex-col items-start gap-[1px] pl-[1px] -ml-[7px]">
        <ProjectNameField />
        <div class="pl-[7px]">
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
