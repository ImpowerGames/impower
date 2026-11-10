import {
  CloudIcon,
  DeviceIcon,
  DownloadIcon,
  DownloadTrayIcon,
  ListRow,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ShareIcon,
} from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { downloadProjectZip } from "../../utils/downloadProjectZip";
import { exportBackup, persistAskOf } from "../../utils/storagePersistence";
import {
  DEVICE_STORAGE_COPY as COPY,
  type SaveStatus,
} from "../../workspace/saveStatus";
import workspace from "../../workspace/WorkspaceStore";

type WorkspaceWindow =
  (typeof import("../../workspace/Workspace"))["Workspace"]["window"];

const withWindow = async (act: (win: WorkspaceWindow) => unknown) => {
  const { Workspace } = await import("../../workspace/Workspace");
  await act(Workspace.window);
};

type StorageAction = "keep" | "install" | "home-screen" | "drive" | "export";

function ActionRow({
  action,
  icon,
  label,
  description,
  onPress,
}: {
  action: StorageAction;
  icon: ComponentChildren;
  label: string;
  description: string;
  onPress?: () => void;
}) {
  return (
    <li data-storage-action={action}>
      <ListRow
        size="compact"
        overflow="clamp"
        icon={icon}
        label={label}
        description={description}
        onClick={onPress}
      />
    </li>
  );
}

export default function LocalStorageStatus({
  status,
  buttonClass,
}: {
  status: SaveStatus;
  buttonClass: string;
}) {
  const [open, setOpen] = useState(false);
  const device = useComputed(() => workspace.deviceStorage.value).value;
  const signedIn = !!workspace.signals.account.value;
  const signinLabel = workspace.signals.signinLabel.value;
  const persisted = device?.persisted ?? false;
  const marked = !!device && !persisted;

  const run = (act: () => unknown) => {
    setOpen(false);
    void act();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-local-storage-status
          data-tone={status.tone}
          class={buttonClass}
          title={COPY.statusTitle}
        >
          {status.text}
          {marked && (
            <span
              data-storage-marker
              role="img"
              aria-label={COPY.marker}
              class="size-1.5 flex-none rounded-full bg-warning"
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        data-local-storage-popover
        size="panel"
        side="bottom"
        align="start"
        aria-label={COPY.statusTitle}
      >
        <div class="px-4 pt-3.5 pb-2 text-[13px]/[1.5]">
          <p class="font-semibold text-ink">{COPY.where}</p>
          <p class="text-muted">
            {persisted ? COPY.persisted : COPY.notPersisted}
          </p>
        </div>
        <ul class="flex flex-col p-1.5 pt-0">
          {device && persistAskOf(device) === "on-press" && (
            <ActionRow
              action="keep"
              icon={<DeviceIcon />}
              label={COPY.keep}
              description={COPY.keepDetail}
              onPress={() =>
                run(() => withWindow((win) => win.keepProjectOnDevice()))
              }
            />
          )}
          {device?.install === "prompt" && (
            <ActionRow
              action="install"
              icon={<DownloadTrayIcon />}
              label={COPY.install}
              description={COPY.installDetail}
              onPress={() => run(() => withWindow((win) => win.installApp()))}
            />
          )}
          {device?.install === "home-screen" && (
            <ActionRow
              action="home-screen"
              icon={<ShareIcon />}
              label={COPY.homeScreen}
              description={COPY.homeScreenDetail}
            />
          )}
          <ActionRow
            action="drive"
            icon={<CloudIcon />}
            label={signedIn ? COPY.saveToDrive : signinLabel}
            description={COPY.driveDetail}
            onPress={() =>
              run(() =>
                withWindow((win) =>
                  signedIn ? win.saveProjectToDrive() : win.signInToGoogleDrive(),
                ),
              )
            }
          />
          <ActionRow
            action="export"
            icon={<DownloadIcon />}
            label={COPY.export}
            description={COPY.exportDetail}
            onPress={() => run(() => exportBackup(downloadProjectZip))}
          />
        </ul>
      </PopoverContent>
    </Popover>
  );
}
