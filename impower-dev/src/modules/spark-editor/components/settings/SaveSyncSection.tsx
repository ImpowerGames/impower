import {
  Button,
  CloudIcon,
  DeviceIcon,
  DownloadIcon,
  FolderIcon,
  PlusIcon,
  SettingsList,
  SettingsRow,
  SettingsSection,
  SignOutIcon,
} from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { useRef, useState } from "preact/hooks";
import { downloadProjectZip } from "../../utils/downloadProjectZip";
import { WorkspaceConstants } from "../../workspace/WorkspaceConstants";
import workspace from "../../workspace/WorkspaceStore";
import { useLocalSaveLabel, useSaveStatus } from "../drive-sync";

type WorkspaceWindow =
  (typeof import("../../workspace/Workspace"))["Workspace"]["window"];

const withWindow = async (act: (win: WorkspaceWindow) => unknown) => {
  const { Workspace } = await import("../../workspace/Workspace");
  await act(Workspace.window);
};

type Backup = "idle" | "working" | "failed";

const BACKUP_DETAIL: Record<Backup, string> = {
  idle: "Every script and asset as a .zip, named after the project.",
  working: "Preparing the .zip…",
  failed: "Could not create the backup. Try again.",
};

const IMPORT_DETAIL =
  "Replace this project with the contents of a backup. Files the backup lacks are removed.";

const CLOUD_DETAIL =
  "Keep a copy on Google Drive for online backup, revision history and working on other devices. Optional; nothing here needs an account.";

export type SaveSyncSectionProps = {
  id: string;
  title: string;
};

export default function SaveSyncSection({ id, title }: SaveSyncSectionProps) {
  const localLabel = useLocalSaveLabel();
  const syncStatus = useComputed(() => workspace.signals.syncStatus.value).value;
  const account = workspace.signals.account.value;
  const projectId = workspace.signals.projectId.value;
  const onDrive =
    !!projectId && projectId !== WorkspaceConstants.LOCAL_PROJECT_ID;
  const driveStatus = useSaveStatus();
  const [backup, setBackup] = useState<Backup>("idle");
  const picker = useRef<HTMLInputElement | null>(null);

  const download = async () => {
    setBackup("working");
    setBackup((await downloadProjectZip()) ? "idle" : "failed");
  };

  const choose = (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = "";
    if (file) {
      void withWindow((win) => win.requestProjectReplace(file));
    }
  };

  const importDetail =
    syncStatus === "importing" ? (
      "Replacing the project…"
    ) : syncStatus === "import_error" ? (
      <span class="text-error-strong">Could not import that backup.</span>
    ) : (
      IMPORT_DETAIL
    );

  return (
    <SettingsSection id={id} title={title}>
      <SettingsList>
        <SettingsRow
          id="save-device"
          icon={<DeviceIcon />}
          name="Saved to this device"
          detail="Saved as you write. (Clearing your browser's site data may irrevocably delete your data.)"
          control={
            <span
              data-local-save
              class="flex-none rounded-[5px] bg-elevated px-[9px] py-[5px] text-[11px]/[1.4] font-semibold tracking-[0.05em]"
            >
              {localLabel}
            </span>
          }
        />
        <SettingsRow
          id="save-backup"
          icon={<DownloadIcon />}
          name="Download a backup"
          detail={
            backup === "failed" ? (
              <span class="text-error-strong">{BACKUP_DETAIL.failed}</span>
            ) : (
              BACKUP_DETAIL[backup]
            )
          }
          control={
            <Button
              variant="quiet"
              disabled={backup === "working"}
              onClick={() => void download()}
            >
              <DownloadIcon />
              <span>Download .zip</span>
            </Button>
          }
        />
        <SettingsRow
          id="save-import"
          icon={<PlusIcon />}
          name="Import a project"
          detail={importDetail}
          control={
            <>
              <input
                ref={picker}
                type="file"
                accept=".zip"
                class="hidden"
                aria-hidden="true"
                tabIndex={-1}
                onChange={(e) => choose(e.currentTarget)}
              />
              <Button
                variant="quiet"
                disabled={syncStatus === "importing"}
                onClick={() => picker.current?.click()}
              >
                <FolderIcon />
                <span>Choose a .zip…</span>
              </Button>
            </>
          }
        />
        {account ? (
          <SettingsRow
            id="save-cloud"
            icon={<CloudIcon />}
            name="Backup & sync online"
            wrap
            detail={
              <>
                <span data-account-name class="block font-semibold text-ink">
                  {account.displayName || account.email}
                </span>
                <span data-drive-status class="block">
                  {onDrive && driveStatus ? driveStatus.text : account.email}
                </span>
              </>
            }
            control={
              <div class="ml-auto flex flex-none flex-wrap justify-end gap-1">
                <Button
                  variant="quiet"
                  disabled={!!account.offline}
                  onClick={() =>
                    void withWindow((win) => win.openProjectFromDrive())
                  }
                >
                  <DownloadIcon />
                  <span>Open a project from Drive</span>
                </Button>
                <Button
                  variant="quiet"
                  onClick={() =>
                    void withWindow((win) => win.signOutOfGoogleDrive())
                  }
                >
                  <SignOutIcon />
                  <span>Disconnect</span>
                </Button>
              </div>
            }
          />
        ) : (
          <SettingsRow
            id="save-cloud"
            icon={<CloudIcon />}
            name="Backup & sync online"
            detail={CLOUD_DETAIL}
            control={
              <Button
                variant="quiet"
                onClick={() =>
                  void withWindow((win) => win.signInToGoogleDrive())
                }
              >
                <CloudIcon />
                <span>Connect Google Drive</span>
              </Button>
            }
          />
        )}
      </SettingsList>
    </SettingsSection>
  );
}
