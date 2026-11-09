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
  MenuIcon,
  SettingsIcon,
  SignOutIcon,
} from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { useRef } from "preact/hooks";
import { WorkspaceConstants } from "../../workspace/WorkspaceConstants";
import workspace from "../../workspace/WorkspaceStore";
import { withWindow } from "./workspaceWindow";
import { useLocalSaveLabel, useSaveStatus } from "../drive-sync";

export const REPORT_BUG_URL =
  "https://github.com/ImpowerGames/impower/issues/new";


export type AppMenuProps = {
  trigger?: "rail" | "bar";
};

export default function AppMenu({ trigger = "rail" }: AppMenuProps) {
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
  const openingGuide = useRef(false);
  const projectId = workspace.signals.projectId.value;
  const onDrive =
    !!projectId && projectId !== WorkspaceConstants.LOCAL_PROJECT_ID;
  const driveStatus = useSaveStatus();

  const setOpen = (next: boolean) =>
    void withWindow((win) => win.setAppMenuOpen(next));

  return (
    <DropdownRoot open={open && !pickingResource} onOpenChange={setOpen}>
      <DropdownTrigger asChild>
        {trigger === "bar" ? (
          <Button
            variant="quiet"
            size="icon"
            aria-label="App menu"
            title="App menu"
            disabled={pickingResource}
            class="text-muted"
          >
            <MenuIcon />
          </Button>
        ) : (
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
        )}
      </DropdownTrigger>
      <DropdownContent
        side="top"
        align="start"
        sideOffset={20}
        onCloseAutoFocus={(event) => {
          if (openingGuide.current) {
            openingGuide.current = false;
            event.preventDefault();
          }
        }}
        class="w-[280px] in-data-[layout=phone]:w-auto"
      >
        <DropdownLabel class="flex flex-row items-center gap-1 py-0 pr-0">
          <span class="min-w-0 flex-1 truncate text-[15px]/[1.3] font-semibold">
            {label}
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
          onSelect={() => {
            openingGuide.current = true;
            void withWindow((win) => win.openSparkdownGuide());
          }}
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
