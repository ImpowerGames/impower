import { SparkLogo } from "@impower/impower-ui/components";
import { useLayout } from "@impower/impower-ui/layout";
import { useComputed } from "@preact/signals";
import workspace from "../../workspace/WorkspaceStore";
import { SyncButton, SyncStatusLine } from "../drive-sync";
import ImportProgressBar from "../import-progress-bar/ImportProgressBar";
import ProjectNameField from "./ProjectNameField";
import { problemCountOf } from "./problemCount";

function ProblemCount() {
  const count = useComputed(() =>
    problemCountOf(workspace.state.value.debug?.diagnosticsSummary),
  ).value;

  if (!count.total) {
    return null;
  }

  return (
    <span
      data-tone={count.errors ? "error" : "warning"}
      class="text-[12px]/[18px] data-[tone=error]:text-error-strong data-[tone=warning]:text-warning-strong"
    >
      <span aria-hidden="true" class="px-1 text-muted">
        ·
      </span>
      {count.total} {count.total === 1 ? "problem" : "problems"}
    </span>
  );
}

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
        <div class="flex items-center pl-[7px]">
          <SyncStatusLine />
          {compact && <ProblemCount />}
        </div>
      </div>
      <div class="flex items-center">
        <SyncButton />
      </div>
      <ImportProgressBar />
    </header>
  );
}
