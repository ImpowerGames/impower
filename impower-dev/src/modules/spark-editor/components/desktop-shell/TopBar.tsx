import { SparkLogo } from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { saveStatusOf } from "../../workspace/saveStatus";
import { WorkspaceConstants } from "../../workspace/WorkspaceConstants";
import workspace from "../../workspace/WorkspaceStore";
import HeaderSyncToolbar from "../header-sync-toolbar/HeaderSyncToolbar";
import ImportProgressBar from "../import-progress-bar/ImportProgressBar";
import ProjectNameField from "./ProjectNameField";

function SaveStatusLine() {
  const status = useComputed(() =>
    saveStatusOf(
      workspace.state.value.sync?.status,
      workspace.state.value.project?.id === WorkspaceConstants.LOCAL_PROJECT_ID,
      workspace.importProgress.value,
    ),
  ).value;

  const openAppMenu = async () => {
    const { Workspace } = await import("../../workspace/Workspace");
    Workspace.window.setAppMenuOpen(true);
  };

  if (!status) {
    return (
      <span class="skeleton-sheen block h-[18px] w-20 rounded-full text-transparent">
        Draft saved
      </span>
    );
  }

  return (
    <div role="status" aria-live="polite" class="flex h-[18px] items-center">
      <button
        type="button"
        data-tone={status.tone}
        class="cursor-pointer rounded-sm px-0 text-[12px]/[18px] text-muted outline-none hover:underline focus-visible:underline data-[tone=saved]:text-success data-[tone=pending]:text-primary data-[tone=warning]:text-warning-strong data-[tone=error]:text-error-strong"
        title="Open the app menu"
        onClick={openAppMenu}
      >
        {status.text}
      </button>
    </div>
  );
}

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
          <SaveStatusLine />
        </div>
      </div>
      <div class="flex items-center">
        <HeaderSyncToolbar />
      </div>
      <ImportProgressBar />
    </header>
  );
}
