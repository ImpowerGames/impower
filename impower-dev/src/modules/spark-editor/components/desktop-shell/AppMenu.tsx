import {
  AccountIcon,
  BugIcon,
  Button,
  CloseIcon,
  ComputerIcon,
  DownloadIcon,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownRoot,
  DropdownSeparator,
  DropdownTrigger,
  HelpIcon,
  SettingsIcon,
  SignOutIcon,
} from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { showSnackbar } from "../../utils/snackbar";
import { WorkspaceConstants } from "../../workspace/WorkspaceConstants";
import workspace from "../../workspace/WorkspaceStore";
import { useLocalSaveLabel, useSaveStatus } from "../drive-sync";

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
  const label = useLocalSaveLabel();
  const account = workspace.signals.account.value;
  const signinLabel = workspace.signals.signinLabel.value;
  const offline = !!account?.offline;
  const pickingResource = useComputed(
    () => !!workspace.state.value.screen?.pickingResource,
  ).value;
  const projectId = workspace.signals.projectId.value;
  const onDrive =
    !!projectId && projectId !== WorkspaceConstants.LOCAL_PROJECT_ID;
  const driveStatus = useSaveStatus();

  const setOpen = (next: boolean) =>
    void withWindow((win) => win.setAppMenuOpen(next));

  return (
    <DropdownRoot open={open && !pickingResource} onOpenChange={setOpen}>
      <DropdownTrigger asChild>
        <Button
          variant="quiet"
          disabled={pickingResource}
          class="w-full justify-start gap-2.5 px-2 text-[13px] font-normal text-muted group-data-[sidebar=collapsed]/sidebar:w-11 group-data-[sidebar=collapsed]/sidebar:justify-center group-data-[sidebar=collapsed]/sidebar:px-0"
        >
          <span class="flex size-7 flex-none items-center justify-center rounded-control border border-edge [&_svg]:size-4">
            <ComputerIcon />
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
              {account
                ? "Signed in to Google Drive."
                : "No account needed to start writing."}
            </span>
          </span>
          <Button
            size="icon"
            aria-label="Close app menu"
            onClick={() => setOpen(false)}
          >
            <CloseIcon />
          </Button>
        </DropdownLabel>
        {account ? (
          <>
            <DropdownLabel class="flex flex-row items-center gap-3">
              <span class="flex size-8 flex-none items-center justify-center overflow-hidden rounded-full border border-edge [&_svg]:size-4">
                {account.photoUrl ? (
                  <img
                    src={account.photoUrl}
                    alt=""
                    referrerpolicy="no-referrer"
                    class="size-full object-cover"
                  />
                ) : (
                  <AccountIcon />
                )}
              </span>
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="truncate text-[13px]/[1.4] font-semibold">
                  {account.displayName || account.email}
                </span>
                <span class="truncate text-[12px]/[1.5] text-muted">
                  {onDrive && driveStatus ? driveStatus.text : account.email}
                </span>
              </span>
            </DropdownLabel>
            <DropdownItem
              disabled={offline}
              onSelect={() => void withWindow((win) => win.openProjectFromDrive())}
            >
              <DownloadIcon />
              Open a project from Drive
            </DropdownItem>
            <DropdownItem
              onSelect={() => void withWindow((win) => win.signOutOfGoogleDrive())}
            >
              <SignOutIcon />
              Sign out
            </DropdownItem>
          </>
        ) : (
          <DropdownItem
            onSelect={() => void withWindow((win) => win.signInToGoogleDrive())}
          >
            <AccountIcon />
            {signinLabel}
          </DropdownItem>
        )}
        <DropdownItem
          onSelect={() => void withWindow((win) => win.navigateTo("project"))}
        >
          <SettingsIcon />
          Settings
        </DropdownItem>
        <DropdownSeparator />
        <DropdownItem
          onSelect={() =>
            showSnackbar({
              message: "Help and guides will be available here.",
            })
          }
        >
          <HelpIcon />
          {"Help & guide"}
        </DropdownItem>
        <DropdownItem
          onSelect={() =>
            window.open(REPORT_BUG_URL, "_blank", "noopener,noreferrer")
          }
        >
          <BugIcon />
          Report a bug
        </DropdownItem>
      </DropdownContent>
    </DropdownRoot>
  );
}
