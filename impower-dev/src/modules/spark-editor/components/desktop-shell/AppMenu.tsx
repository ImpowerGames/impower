import {
  BrandGoogleDrive,
  Browser,
  Bug,
  Button,
  Download,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownRoot,
  DropdownSeparator,
  DropdownTrigger,
  InfoCircle,
  Sliders,
  Upload,
  X,
} from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { useRef } from "preact/hooks";
import { downloadProjectZip } from "../../utils/downloadProjectZip";
import { importProjectFile } from "../../utils/importProjectFile";
import { showSnackbar } from "../../utils/snackbar";
import { localSaveLabel } from "../../workspace/saveStatus";
import { WorkspaceConstants } from "../../workspace/WorkspaceConstants";
import workspace from "../../workspace/WorkspaceStore";

export const REPORT_BUG_URL =
  "https://github.com/ImpowerGames/impower/issues/new";

type WorkspaceWindow =
  (typeof import("../../workspace/Workspace"))["Workspace"]["window"];

const withWindow = async (act: (win: WorkspaceWindow) => unknown) => {
  const { Workspace } = await import("../../workspace/Workspace");
  await act(Workspace.window);
};

export default function AppMenu() {
  const open = useComputed(
    () => !!workspace.state.value.screen?.appMenuOpen,
  ).value;
  const label = useComputed(() =>
    localSaveLabel(
      workspace.state.value.sync?.status,
      workspace.state.value.project?.id === WorkspaceConstants.LOCAL_PROJECT_ID,
    ),
  ).value;
  const account = workspace.signals.account.value;
  const signinLabel = workspace.signals.signinLabel.value;
  const offline = !!account?.offline;
  const pickingResource = useComputed(
    () => !!workspace.state.value.screen?.pickingResource,
  ).value;
  const fileInput = useRef<HTMLInputElement | null>(null);

  const setOpen = (next: boolean) =>
    void withWindow((win) => win.setAppMenuOpen(next));

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept=".zip"
        class="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => void importProjectFile(e.target as HTMLInputElement)}
      />
      <DropdownRoot open={open && !pickingResource} onOpenChange={setOpen}>
        <DropdownTrigger asChild>
          <Button
            variant="quiet"
            disabled={pickingResource}
            class="w-full justify-start gap-2.5 px-2 text-[13px] font-normal text-muted group-data-[sidebar=collapsed]/sidebar:w-11 group-data-[sidebar=collapsed]/sidebar:justify-center group-data-[sidebar=collapsed]/sidebar:px-0"
          >
            <span class="flex size-7 flex-none items-center justify-center rounded-control border border-edge [&_svg]:size-4">
              <Browser />
            </span>
            <span class="truncate group-data-[sidebar=collapsed]/sidebar:sr-only">
              {label}
            </span>
          </Button>
        </DropdownTrigger>
        <DropdownContent
          side="top"
          align="start"
          sideOffset={20}
          class="w-[280px]"
        >
          <DropdownLabel class="flex flex-row items-start gap-1 pr-0">
            <span class="flex min-w-0 flex-1 flex-col pt-1">
              <span class="text-[15px]/[1.3] font-semibold">{label}</span>
              <span class="whitespace-nowrap text-[12px]/[1.5] text-muted">
                No account needed to start writing.
              </span>
            </span>
            <Button
              size="icon"
              aria-label="Close app menu"
              onClick={() => setOpen(false)}
            >
              <X />
            </Button>
          </DropdownLabel>
          <DropdownItem
            onSelect={() =>
              void withWindow((win) =>
                account ? win.navigateTo("project") : win.signInToGoogleDrive(),
              )
            }
          >
            <BrandGoogleDrive />
            {signinLabel}
          </DropdownItem>
          <DropdownItem
            onSelect={() => void withWindow((win) => win.navigateTo("project"))}
          >
            <Sliders />
            Settings
          </DropdownItem>
          <DropdownSeparator />
          {account ? null : (
            <>
              <DropdownItem
                disabled={offline}
                onSelect={() => fileInput.current?.click()}
              >
                <Download />
                Import Project
              </DropdownItem>
              <DropdownItem
                disabled={offline}
                onSelect={() => void downloadProjectZip()}
              >
                <Upload />
                Export Project
              </DropdownItem>
            </>
          )}
          <DropdownItem
            onSelect={() =>
              showSnackbar({
                message: "Help and guides will be available here.",
              })
            }
          >
            <InfoCircle />
            {"Help & guide"}
          </DropdownItem>
          <DropdownItem
            onSelect={() =>
              window.open(REPORT_BUG_URL, "_blank", "noopener,noreferrer")
            }
          >
            <Bug />
            Report a bug
          </DropdownItem>
        </DropdownContent>
      </DropdownRoot>
    </>
  );
}
